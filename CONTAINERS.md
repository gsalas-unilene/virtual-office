# Ejecutar UNILENE localmente con Docker

Desde la raíz del repositorio, configure manualmente el archivo privado
`credentials.sh` del backend usando como referencia
`reserva-unilene-backend/credentials.example.sh`. Después ejecute:

```bash
./run.sh
```

El script carga el archivo privado sin mostrar su salida, valida Compose y
ejecuta **down → build → up** únicamente para el proyecto
`unilene-reservations`. Se detiene ante errores y no elimina volúmenes. La
reconstrucción interrumpe el servicio y cierra las sesiones existentes.
Se requieren Docker Engine, Compose v2 o posterior e internet para la primera
construcción.

- Angular: <http://localhost:8080> (compilación estática y Nginx sin privilegios), publicado en `0.0.0.0:8080` para la intranet. Sin HTTPS: pendiente antes de producción.
- El backend no publica puerto en el host; solo se alcanza por el proxy de Nginx.
- Estado de la API: <http://localhost:8080/api/health>.
- Conexión con la base: <http://localhost:8080/api/health/ready>.

Las comprobaciones de salud de los contenedores confirman que los servicios
están activos, **no** que exista conexión con la base. Los puertos solo se
publican en el equipo local. No se crea un contenedor de SQL Server.

## Inicio de sesión y visor

Agregue manualmente `SECRET_KEY_LOGIN` al archivo privado de credenciales con
la misma clave del sistema existente. El backend consulta un usuario mediante
`sql/user_by_name.sql` y compara el SHA-256 almacenado con el resultado de
`encript.py`. No devuelve contraseñas ni hashes al navegador. Nginx comprueba
la sesión antes de servir el visor y el modelo 3D; cerrar sesión la invalida.

Las sesiones se conservan en memoria durante un máximo de ocho horas y se
pierden al reiniciar el backend. La configuración HTTP actual está destinada
únicamente a uso local. Antes de exponer el servicio remotamente, configure
HTTPS, cookies seguras (`RESERVA_SECURE_COOKIE=1`), protección de autenticación
y almacenamiento de sesiones apropiados para producción. La compatibilidad TLS
de la base no sustituye HTTPS entre navegador y aplicación.

## SQL Server antiguo y TLS 1.0

TLS 1.0 es obsoleto. Se recomienda actualizar SQL Server y habilitar TLS 1.2 o
posterior. Para la base antigua, active la compatibilidad de forma explícita:

```bash
RESERVA_ALLOW_LEGACY_TLS=1 ./run.sh
```

También puede agregar manualmente `export RESERVA_ALLOW_LEGACY_TLS='1'` al
archivo privado. Esto selecciona, solo para el proceso del backend, una
configuración OpenSSL con `MinProtocol=TLSv1` y `DEFAULT:@SECLEVEL=0`. Permite
protocolos y cifrados más débiles; no fuerza TLS 1.0 ni modifica el sistema
anfitrión o el frontend. Tras actualizar el servidor, desactive la opción con
`0` y recree los contenedores. La compatibilidad depende del controlador y del
servidor: debe comprobarse con el endpoint de conexión de base de datos.

`RESERVA_SQLSERVER_ENCRYPT` y `RESERVA_SQLSERVER_TRUST_SERVER_CERTIFICATE` son
opciones independientes. Confiar en un certificado no corrige una incompatibilidad
de protocolo. `Encrypt=no` no garantiza que el inicio de sesión en SQL Server
evite TLS. El script no modifica estas variables.

## Protección de credenciales y pruebas

Los contextos de construcción usan listas permitidas: las credenciales no se
copian ni se montan en las imágenes y solo se pasan al entorno del backend en
ejecución. Los administradores de Docker pueden inspeccionar ese entorno: no
comparta la salida de `docker inspect`, la configuración renderizada de Compose
ni los diagnósticos completos del controlador. El archivo privado pertenece al
operador; la automatización solo lo carga cuando está autorizada y no modifica
su contenido.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_unilene_containers.py
cd reserva-unilene-backend && uv run pytest -q
```
