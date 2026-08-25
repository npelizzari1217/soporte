// Imprime el marcador EN EL CUERPO del módulo (no dentro de un test): el
// IMPORT mismo es el efecto que `entorno-corte-arranque.spec.ts` verifica que
// nunca ocurre cuando falta una variable de entorno requerida — análogo fiel
// de `AppModule`, cuyo import también dispara efectos.
console.log('MARCADOR_ENTORNO_FIXTURE_OK');
