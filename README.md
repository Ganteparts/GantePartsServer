# Inventario Mercado Libre MX

App base en Next.js (App Router) con autenticacion por email/contrasena, roles, Prisma y Postgres local. Incluye:
- Sincronizacion pensada para stock y precio con Mercado Libre (MX), listo para webhooks.
- Pausa automatica al llegar a stock 0 (luego de implementar la sync real con ML).
- Roles: admin, operador, lectura (extensible).
- Auditoria basica y notificaciones en la UI (stubs).
- Importa/crea inventario, muestra todos los campos y permite borrar registros individual o masivamente desde la tabla.

## Campos soportados en importacion
- Encabezados: ESTATUS, DESCRIPCION, DESCRIPCION LOCAL, DESCRIPCION ML, PRECIO, CODIGO, STOCK, CODIGO UNIVERSAL, CODIGO DE MERCADO LIBRE, ESTATUS INTERNO, ORIGEN, MARCA, COCHE, AÑO DESDE, AÑO HASTA, UBICACION, FACEBOOK, PIEZA.
- La plantilla Excel incluye listas desplegables para ESTATUS, ESTATUS INTERNO, ORIGEN; MARCA, COCHE, AÑOS, UBICACION, FACEBOOK y DESCRIPCION LOCAL se pueden capturar libremente para permitir nuevas opciones.

## Requisitos
- Node 18+
- Postgres local

## Variables de entorno
Copia `.env.example` a `.env` y completa:
- `DATABASE_URL` (Postgres local)
- `NEXTAUTH_SECRET`
- Credenciales ML (`ML_APP_ID`, `ML_APP_SECRET`, `ML_REDIRECT_URI`, `ML_WEBHOOK_SECRET`)

## Scripts
- `npm install`
- `npm run db:push` (crea tablas Prisma)
- `npm run dev` (http://localhost:3000)
- `npm run lint`
- `npm run test`

## Despliegue en Ubuntu (Docker)
Resumen: se usa `docker compose` para levantar la app y Postgres en contenedores separados.

### 1) Preparar servidor
Instala Docker y Docker Compose:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Reinicia sesion para que el usuario tenga permisos de Docker.

### 2) Copiar el proyecto
Clona el repo o sube los archivos al servidor (por ejemplo en `/opt/proyecto-gante`).

### 3) Configurar variables
En el servidor:

```bash
cp .env.example .env
```

Edita `.env`:
- `DATABASE_URL` para Postgres (si usas el contenedor de abajo, usa `postgresql://gante:changeme@db:5432/inventario`).
- `NEXTAUTH_SECRET` (genera uno seguro).
- `NEXTAUTH_URL` (temporalmente `http://IP_DEL_SERVIDOR:3000`, luego el dominio).
- Credenciales de Mercado Libre.

### 4) Levantar servicios

```bash
docker compose up -d --build
```

Aplicar migraciones Prisma (solo la primera vez o cuando haya cambios):

```bash
docker compose run --rm app npx prisma migrate deploy
```

La app queda en `http://IP_DEL_SERVIDOR:3000`.

### 5) Si ya tienes Postgres en el servidor
Si prefieres usar el Postgres existente:
1) Remueve el servicio `db` de `docker-compose.yml` y tambien `depends_on`.
2) Ajusta `DATABASE_URL` usando `host.docker.internal`, por ejemplo:
	`postgresql://usuario:password@host.docker.internal:5432/inventario`

### 6) Nginx opcional (cuando compres dominio)
Puedes poner Nginx como reverse proxy para SSL y el dominio. Flujo recomendado:
1) Apunta el dominio al IP del servidor.
2) Instala Nginx y certbot (Let’s Encrypt).
3) Redirige `80/443` a `localhost:3000`.

## Flujo basico
1) `npm install`
2) Configura `.env`
3) `npm run db:push`
4) `npm run dev`
5) Crea usuario en `/registro` y luego ingresa en `/login`

## Notas de sync Mercado Libre
- Se mapea SKU interno a `seller_custom_field` y opcionalmente `mlItemId`.
- Webhooks recomendados para tiempo real; agrega endpoint y valida `ML_WEBHOOK_SECRET`.
- Conflictos: la app es la fuente de verdad (sobrescribe ML).

## Pendiente
- Endpoints de webhooks ML y jobs de refuerzo.
- Importar Excel y personalizar encabezados (parcial: ya se importa con encabezados basicos).
- UI de notificaciones y auditoria.
- Soporte multi-cuenta ML futuro.
