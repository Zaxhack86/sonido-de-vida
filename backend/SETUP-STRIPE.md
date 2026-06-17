# Activar pagos con Stripe — pasos finales

El código ya está desplegado. Falta SOLO conectar tu cuenta de Stripe.
Mientras no hagas esto, el botón "Empezar prueba" muestra "los pagos se activan
muy pronto" (no se rompe nada).

Plan acordado: **$2.99/mes** y **$24.99/año**, con **7 días de prueba gratis**.

---

## 1. Crea el producto y los dos precios (en Stripe)

1. Entra a https://dashboard.stripe.com → **Catálogo de productos** → **+ Añadir producto**.
2. Nombre: `Sonido de Vida Premium`.
3. Añade **dos precios** al mismo producto:
   - Recurrente · **$2.99 USD** · cada **mes**.
   - Recurrente · **$24.99 USD** · cada **año**.
4. Guarda. Copia los dos **IDs de precio** (empiezan por `price_...`).
   Los ves en cada precio → "ID de precio de la API".

> ⚠️ La prueba de 7 días la pone el código automáticamente (no la configures en
> el precio, o se aplicaría dos veces).

---

## 2. Pega los price IDs y vuelve a desplegar el worker

En `backend/wrangler-api.toml`, reemplaza los placeholders:

```toml
STRIPE_PRICE_MONTHLY = "price_TU_ID_MENSUAL"
STRIPE_PRICE_ANNUAL  = "price_TU_ID_ANUAL"
STRIPE_TRIAL_DAYS    = "7"
```

(Si me los pasas, te los pego yo.)

---

## 3. Configura los secretos en Cloudflare

Ejecuta estos comandos en `backend/` (te pedirá pegar el valor de cada uno):

```bash
cd backend
npx wrangler@3 secret put STRIPE_SECRET_KEY -c wrangler-api.toml
# pega tu clave secreta de Stripe:  sk_live_...  (o sk_test_... para probar)
```

La clave secreta está en Stripe → **Desarrolladores → Claves de API**.

---

## 4. Crea el webhook (en Stripe)

1. Stripe → **Desarrolladores → Webhooks → + Añadir endpoint**.
2. URL del endpoint:
   ```
   https://sonido-de-vida-api.sonidodevida.workers.dev/api/stripe/webhook
   ```
3. Eventos a escuchar (selecciona estos 4):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Crea el endpoint y copia el **Signing secret** (empieza por `whsec_...`).
5. Guárdalo como secreto en Cloudflare:
   ```bash
   npx wrangler@3 secret put STRIPE_WEBHOOK_SECRET -c wrangler-api.toml
   # pega:  whsec_...
   ```

---

## 5. Despliega de nuevo el worker

```bash
cd backend
npx wrangler@3 deploy -c wrangler-api.toml
```

¡Listo! El flujo completo queda activo:

- El usuario pulsa "Empezar prueba" → va a Stripe Checkout → mete tarjeta →
  empieza su prueba de 7 días.
- Stripe avisa al webhook → el worker marca al usuario como premium en KV.
- Al volver a la app ve "🎉 ¡Bienvenido a Premium!" y se le quitan los anuncios.
- En la pestaña **Yo** → "⚙️ Gestionar mi suscripción" abre el portal de Stripe
  para cancelar o cambiar de plan.

---

## Probar sin cobrar de verdad (recomendado antes de lanzar)

Usa las **claves de prueba** (`sk_test_...`) y los price IDs del **modo prueba**.
Tarjeta de prueba de Stripe: `4242 4242 4242 4242`, cualquier fecha futura y CVC.
Cuando todo funcione, repite con las claves `live`.

## Cómo subir el precio más adelante (los fundadores conservan el suyo)

Crea un **nuevo precio** ($3.99/mes, etc.) en el mismo producto y cambia el
`STRIPE_PRICE_MONTHLY` por el nuevo ID. Quien ya esté suscrito mantiene su tarifa
vieja automáticamente — Stripe no recobra a los existentes.
