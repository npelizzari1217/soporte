-- DropTable
-- Feature "routing" (usuario↔tipo_ticket) removido: la elegibilidad de
-- asignación se resuelve por el módulo del catálogo del TipoTicket, no por
-- esta tabla. La tabla quedó DORMANTE y se elimina.
DROP TABLE "usuario_tipos_ticket";
