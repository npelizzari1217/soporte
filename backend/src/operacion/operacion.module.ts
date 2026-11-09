import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { leerSmtpSistema } from '../config/smtp-sistema';
import { SmtpEmailSender } from '../notificaciones/infrastructure/email/smtp-email-sender';
import { ILogger, LOGGER } from '../shared/domain/ports/i-logger.port';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import {
  MONITOR_SATURACION,
  MonitorSaturacion,
} from '../shared/infrastructure/saturacion/monitor-saturacion';
import { AvisarSaturacionARoot } from './application/avisar-saturacion-a-root';
import { PrismaDestinatariosRoot } from './infrastructure/prisma-destinatarios-root';
import { OperacionController } from './interface/operacion.controller';

/**
 * OperacionModule — avisos de operación del servicio para ROOT (odd/saturacion-conexiones, S3).
 *
 * Se suscribe al `MonitorSaturacion` de `SharedModule` (que no depende de este módulo) y manda el
 * correo por la cuenta SMTP del sistema (`SMTP_*`). Sin esa cuenta, el aviso queda en el log y en
 * `GET /operacion/saturacion`.
 */
@Module({
  // JwtAuthGuard y GlobalAdminGuard necesitan TOKEN_SERVICE, que exporta AuthModule.
  imports: [AuthModule],
  controllers: [OperacionController],
  providers: [
    {
      provide: AvisarSaturacionARoot,
      useFactory: (prisma: PrismaService, logger: ILogger) => {
        const smtp = leerSmtpSistema(process.env);
        return new AvisarSaturacionARoot(
          new PrismaDestinatariosRoot(prisma),
          smtp ? new SmtpEmailSender(smtp, logger) : null,
          logger,
        );
      },
      inject: [PrismaService, LOGGER],
    },
  ],
})
export class OperacionModule implements OnModuleInit {
  constructor(
    @Inject(MONITOR_SATURACION) private readonly monitor: Pick<MonitorSaturacion, 'suscribir'>,
    private readonly avisar: AvisarSaturacionARoot,
  ) {}

  /** Conecta el correo a ROOT con el conteo de saturaciones. */
  onModuleInit(): void {
    this.monitor.suscribir((resumen) => this.avisar.execute(resumen));
  }
}
