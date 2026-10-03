<div align="center">
  <img src="public/brand/product-lockup-positive.svg" alt="QR Pagamentos" width="420">

  <h1>QR Pagamentos</h1>

  <p><strong>Your storefront. Your products. Payments by QR Code.</strong></p>
  <p>
    A self-hosted online store for selling through shareable links and simple
    QR Code checkouts, connected to international payment infrastructure.
  </p>

  <p>
    <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-yes-17324D?style=flat-square">
    <img alt="Languages: Portuguese and English" src="https://img.shields.io/badge/languages-pt--BR%20%7C%20en-D9A441?style=flat-square">
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs">
    <img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white">
  </p>
</div>

---

QR Pagamentos turns a product catalog into a complete, branded payment
experience. Merchants publish their store, share a product or payment link, and
let customers finish the purchase through a clear QR Code flow — without a
buyer account.

> [!IMPORTANT]
> **Nautt Finance is currently the only supported payment provider.** The
> integration uses [Nautt Finance](https://nauttfinance.com) for payment
> processing. Support for additional providers is planned.

## Everything needed to sell

| Storefront | Payments | Management |
| --- | --- | --- |
| Branded public store | QR Code checkout | Sales dashboard |
| Products, categories and images | Fixed-amount or product links | Order tracking |
| Custom colors, logo, theme and layout | Single-use or reusable links | Product and link management |
| Portuguese and English | Optional expiration dates | Merchant and administrator areas |
| Browser-local shopping cart | Standalone custom-amount payments | Provider status and balance |

### A storefront that feels like your own

Create a public catalog with your identity, organize products into categories,
add images and prices, and choose how the store looks. The interface supports
both `pt-BR` and `en`, including the customer-facing journey.

### Flexible ways to collect

Sell a cart of products, charge a fixed amount, or let the customer enter a
custom amount. Payment links can be reusable, single-use or time-limited, and
can be shared anywhere a URL or QR Code can go.

### A checkout built for less friction

Customers do not need an account. They open the store or payment link, review
the order, provide only the information required by the merchant, and pay from
the generated QR Code. Payment updates flow back into the order history.

```text
Create a product  →  Publish or share  →  Customer scans  →  Track the order
```

## Payment provider

QR Pagamentos owns the catalog, storefront, payment links, checkout and order
history. The provider is responsible for the payment rail itself.

Today, every payment is processed through
**[Nautt Finance](https://nauttfinance.com)**. Each merchant connects their own
Nautt credentials, while an administrator controls the currency pairs and
payment methods available in the installation.

The provider boundary was designed so more payment providers can be added in
the future without turning the storefront into a provider-owned experience.

## Install

QR Pagamentos is self-hosted. The production installer uses Docker Compose and
keeps PostgreSQL and uploaded media in managed local volumes.

### Requirements

- A Linux host with Git.
- [Docker Engine](https://docs.docker.com/engine/install/) and the
  [Docker Compose v2 plugin](https://docs.docker.com/compose/install/linux/).
- A user that can access Docker without `sudo`.
- A public HTTPS address and an SMTP account for password-recovery email.
- A Nautt Finance account and API credentials.

### 1. Download and configure

```sh
git clone https://github.com/gabesan21/qr-pagamentos.git
cd qr-pagamentos
cp install/.env.example install/.env
```

Open `install/.env` and configure the public URL, Nautt webhook URL, SMTP,
initial administrator username and the three distinct database passwords.
Never commit this file.

### 2. Run the installer

```sh
install/install.sh
```

The installer prepares the secrets, database, migrations and application. It
prints the protected path containing the generated initial administrator
password; the default location is `.install-secrets/initial_admin_password`.

### 3. Finish the first payment setup

After signing in:

1. Register a Nautt currency pair in the administrator settings.
2. Add the merchant's Nautt API key in the merchant settings.
3. Verify the pair and enable the intended currency and payment method.
4. Configure and publish the storefront.

The exact first-pair procedure is documented in the
[production runbook](docs/production-runbook.md#first-currency-pair-setup).

> [!NOTE]
> The application listens on the configured loopback port. A production
> deployment needs a separately managed HTTPS reverse proxy. See the
> [production runbook](docs/production-runbook.md) before going live.

## Update

From the clean Git checkout used by the installation, run:

```sh
install/update.sh
```

The updater fetches and fast-forwards the tracked branch, validates migration
policy and credentials, builds the target release, applies pending migrations,
and promotes the application only after its safety gates succeed. Existing
database and media volumes are retained.

For a non-default environment file:

```sh
install/update.sh --env-file /absolute/path/to/install.env
```

## Back up the database

Database rows and uploaded media form one consistent data set, so the supported
backup always captures **PostgreSQL and media together**.

Create an external directory owned by the invoking user and restrict it to mode
`0700`, then run:

```sh
mkdir -p /srv/qr-pagamentos-backups
chmod 0700 /srv/qr-pagamentos-backups
install/backup.sh --destination /srv/qr-pagamentos-backups
```

The application pauses only for the consistency cut, then restarts. The result
contains the database dump, media archive and a checksum manifest.

To restore a matching backup and release:

```sh
install/restore.sh \
  --backup /srv/qr-pagamentos-backups/qr-pair-YYYYMMDDTHHMMSSZ \
  --confirm RESTORE:qr-pagamentos
```

> [!WARNING]
> Restore replaces the managed database and media pair. Read the
> [technical reference](docs/technical-reference.md) before using it in
> production.

## Uninstall

Remove the application containers and networks while preserving the database,
media, credentials and recovery material:

```sh
install/uninstall.sh
```

To permanently remove the managed PostgreSQL and media volumes as well, use the
explicit project confirmation:

```sh
install/uninstall.sh --purge-data qr-pagamentos
```

> [!CAUTION]
> `--purge-data` permanently deletes the managed database and uploaded media.
> Create and verify an external backup first.

## Documentation

- [Production runbook](docs/production-runbook.md) — deployment boundaries,
  HTTPS proxy requirements, secrets and recovery procedures.
- [Technical reference](docs/technical-reference.md) — development commands,
  database policy, container topology and verification details preserved from
  the original README.
- [Release rehearsal](docs/release-rehearsal.md) — pre-release operational
  verification.
- [Project scope](pop/PROJECT.md) and [roadmap](pop/ROADMAP.md) — product direction and
  planned work.

---

<div align="center">
  <strong>Simple for the customer. Owned by the merchant.</strong>
</div>
