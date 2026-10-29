# Reserva UNILENE

Aplicación Angular 22 para el acceso y el visor del piso administrativo.

## Desarrollo local

```bash
bun install --frozen-lockfile
bun run start
```

Abra `http://localhost:4200/`. Para probar el inicio de sesión junto con el
backend y el visor integrado, consulte `../CONTAINERS.md`.

## Verificación

```bash
bun run test --watch=false
bun run build
```

La compilación de producción se genera en `dist/`. Las reservas y el rediseño
del recorrido 3D están pendientes; consulte `../odd/tasks/puestos-reservables-3d.md`.
