# Prompt: Create a New Frontend Template for QR Pagamentos

## Objective

Create a complete new frontend template for **QR Pagamentos**, a bilingual payment-management application backed by Nautt Finance.

The template must cover the authenticated administrator area, the authenticated merchant/customer-management area, and the public payment-link checkout. The agent creating the template must understand the purpose, information, actions, and states of every page described below.

Do not infer or change business rules. Do not design backend services, database models, authentication internals, or API contracts. The goal is a frontend template that can later be connected to the existing application behavior.

## Product Roles and Shared Behavior

The application has two authenticated roles:

- **Administrator (`ADMIN`)**: manages the platform globally, including users, payment configuration, global directories, and global analytics.
- **Merchant (`USER`)**: manages only their own store, profile, catalog, payment links, orders, and Nautt connection.

The application supports exactly two languages: Brazilian Portuguese (`pt-BR`) and English (`en`). All pages, controls, validation messages, notices, empty states, and errors must support both languages.

Username and password are the only login credentials. Email is optional profile/contact information and is never used for login.

Authenticated areas must include role-appropriate navigation, the signed-in username, language selection, profile access where applicable, and sign-out. Unauthorized users must not be shown protected content or actions.

Every data-driven page must account for loading, ready, empty, filtered-empty, unavailable, validation-error, request-error, success-notice, and retry states when they apply. Destructive actions require explicit confirmation. Lists must account for searching, filtering, pagination, and invalid query parameters where specified.

## Shared Access Pages

### Login

Allows a user to sign in with username and password. It must handle invalid credentials without revealing which credential was incorrect. When two-factor authentication is enabled for the account, login continues to a TOTP challenge that accepts either a current authenticator code or a recovery code.

### Password Reset

Allows a user with a valid reset token to choose a new password and confirm it. It must cover invalid, expired, already-used, successful, and failed reset states. Passwords accept 12 to 128 characters.

## Administrator Area

The administrator navigation contains Dashboard, Orders, Payment Links, Users, and Settings.

### Administrator Dashboard — `/admin`

Provides a read-only global operational overview. A period selector supports Today, 7 days, and 30 days, with 7 days as the default.

The page reports:

- Total registered, currently active, and deleted users.
- Orders created in the selected period, grouped by source and provider state.
- Provider-confirmed sales and locally finalized sales as separate totals; never merge them.
- Exact monetary totals grouped by currency pair rather than combined across currencies.
- Checkout conversion funnel, including converted, abandoned, and in-progress attempts and their rates.
- Total and active payment links.
- Active and archived product counts.
- Top five merchants by confirmed order count, including a deleted-account indicator when relevant.
- Top five products by confirmed quantity and revenue.

The dashboard is read-only and does not provide merchant-level mutation actions.

### Global Orders Directory — `/admin/orders`

Lists orders across all merchants. It supports search, filters, page-size selection, and pagination. Each row identifies the merchant, payer summary, order source, related payment-link identifier when present, provider state, current local outcome, amount, and creation time.

Filters cover source, monetary class/currency, provider state, local outcome, related payment link, merchant, and date range where available. An administrator can open an order but cannot mutate merchant commerce from this directory.

### Global Order Detail — `/admin/orders/[id]` and `/admin/orders/v2/[id]`

Shows a read-only order record with merchant attribution, source, amount and currency information, timestamps, payer/customer data allowed by the order policy, provider payment state, local outcome, line-item or fixed-amount composition, and related payment-link information. It must provide a safe unavailable state for unknown or inaccessible records.

### Global Payment Links Directory — `/admin/payment-links`

Lists Commerce V2 payment links across all merchants. It supports search, filters, page-size selection, and pagination. Rows communicate merchant ownership, identifier, composition type, reusable or single-use type, active/inactive/paid/expired status, amount or product summary, order count, and creation/expiration information.

This directory is read-only. It must not expose merchant link-creation, editing, activation, or deactivation actions.

### Global Payment Link Detail — `/admin/payment-links/v2/[id]`

Shows the selected link's merchant attribution, public identifier, lifecycle status, link type, composition, descriptions, currency information, expiration, creation/update timestamps, and associated orders. It allows read-only drill-down into related records and provides an unavailable state when the record cannot be resolved.

### Users Directory and Account Creation — `/admin/accounts`

Allows administrators to create accounts and browse all existing users.

Account creation captures a unique username, optional email, initial password, role, and initial account status as permitted by the application rules.

The directory supports search, role and derived-state filters, creation-date filters, page-size selection, and pagination. Each row shows username, optional email, role, active/disabled/deleted state, store state, creation time, last activity, and available actions. Deleted users remain visible but cannot be edited or deleted again.

### User Account Detail and Editor — `/admin/accounts/[id]`

Shows account facts: username, optional email, role, derived state, store state, storefront slug, creation time, and last activity.

For a non-deleted account, the administrator can manage:

- Identity: username and optional email, with conflict handling for concurrent or duplicate changes.
- Access: role, active/disabled status, password reset, and the final-active-administrator safeguard.
- Two-factor recovery: disable the target user's TOTP configuration when authorized.
- Language preference: `pt-BR` or `en`.
- Checkout customer-data policy.
- Storefront configuration: public slug, localized display names, accent value, enabled state, theme, layout, standalone-payment capability, and default currency.
- Terminal soft deletion, with confirmation.

A deleted account shows historical facts only, with no editor or destructive controls. Sensitive credentials, secrets, password hashes, sessions, and provider internals must never appear.

### Platform Settings — `/admin/settings`

Provides six functional sections:

1. **Exchange currencies**: create, list, activate, and deactivate public currency-code mappings connected to Nautt currency and exchange-currency UUIDs.
2. **Nautt currency pairs**: create, rename, list, activate, and deactivate administrator-managed currency-pair records.
3. **Nautt payment methods**: create, rename, list, activate, and deactivate payment-method records.
4. **Global payment settings**: enable the globally supported currencies and payment methods currently used by the application, including BRL and PIX.
5. **Appearance**: choose the default theme assigned to newly created merchant accounts.
6. **Language**: choose the administrator's own `pt-BR` or `en` preference.

Each section must communicate successful saves, validation failures, conflicts, unavailable dependencies, and protected deactivation constraints.

## Merchant / Customer-Management Area

The merchant navigation contains Dashboard, Orders, Payment Links, Products, and Settings. Profile is also directly accessible from the authenticated account area.

All merchant information and actions are owner-scoped: a merchant must never see or manipulate another merchant's data.

### Merchant Dashboard — `/`

Provides an overview of the signed-in merchant's business. A period selector supports Today, 7 days, and 30 days, with 7 days as the default.

The dashboard reports the merchant's order activity, order states and sources, provider-confirmed sales, locally finalized sales as a separate group, exact monetary totals by currency pair, checkout funnel, active/total payment links, active/archived products, and leading products. When the merchant has an enabled storefront with a valid slug, the page provides access to the public store.

### Merchant Orders Directory — `/orders`

Lists only the signed-in merchant's orders. It supports search, source, monetary class/currency, provider-state, local-outcome, payment-link, and date filters, plus page-size selection and pagination.

Each row shows payer summary, source (`LINK`, `STANDALONE`, or `AD_HOC`), related payment-link identifier when present, provider state, current local outcome, amount, creation time, and an action to open the order.

### Merchant Order Detail — `/orders/[id]` and `/orders/v2/[id]`

Shows the complete owner-authorized order information: source, identifiers intended for display, timestamps, payer/customer snapshot, composition or line items, totals, currency information, provider state, payment data allowed for the merchant, and related link information.

Commerce V2 order details also support:

- A chronological merchant comment history and the ability to add comments.
- Recording or updating the current local operational outcome for workflows that permit it.
- Clear distinction between provider-confirmed state and merchant-recorded local outcome.

Unknown, cross-owner, or unavailable orders use one safe unavailable state.

### Payment Links Directory — `/links`

Lists the merchant's current Commerce V2 links and retained legacy links. It supports search, filters, page-size selection, and pagination.

Each V2 row communicates identifier, localized summary, composition type, reusable or single-use type, active/paid/expired state, currency, creation and expiration times, and an action to open the detail. The page provides an action to create a new payment link.

### Create Payment Link — `/links/new`

Creates a Commerce V2 payment link. The merchant chooses:

- Composition: product lines or a fixed amount.
- One active currency pair.
- Reusable or single-use behavior.
- Optional expiration date and time.
- Localized descriptions in Brazilian Portuguese and English.
- For product composition: one or more unique products and a quantity for each.
- For fixed amount: a positive exact-decimal amount.

Creation must explain unavailable dependencies, such as having no active currency pair or no eligible products. It can also create a new version based on an existing link while respecting fields that become immutable after use.

### Payment Link Detail — `/links/v2/[id]`

Shows the link's public identifier and public payment URL, active/paid/expired status, reusable or single-use type, composition, localized descriptions, currency information, product lines or fixed amount, expiration, timestamps, and order summary.

Available actions include copying or opening the public payment URL, editing allowed fields, creating a new version, viewing the link's orders, and activating or deactivating the link when its lifecycle allows it. A paid single-use link cannot return to an unpaid usable state.

### Edit Payment Link — `/links/v2/[id]/edit`

Allows changes that remain valid for the link's lifecycle, including descriptions, expiration, and mutable composition fields. It must clearly preserve immutable or locked fields after the link has been used and offer creation of a new version when editing the existing record is not appropriate. Concurrent-change conflicts and unavailable dependencies must have explicit outcomes.

### Orders for a Payment Link — `/links/v2/[id]/orders`

Lists only orders associated with the selected owner-scoped payment link. It supports search and pagination and shows an order summary, provider state, local outcome, and an action to open each order.

### Payment-Link Order Detail — `/links/v2/[id]/orders/[orderId]`

Shows the selected order in the context of its payment link, including payer data permitted by policy, amount/composition, state, local outcome, and timestamps. It must preserve both the link and order ownership fences and provide navigation back to the link's order directory.

### Products Directory — `/catalog`

Lists the merchant's products with image or fallback, internal name, localized title, exact price and currency code, category, and active/inactive/archived state.

It supports search, state and category filters, page-size selection, and actions to create a product, manage categories, edit an active/inactive product, or inspect an archived product.

### Create Product — `/catalog/products/new`

Creates a merchant-owned product with internal name, Brazilian Portuguese and English titles and descriptions, exact positive price, optional supported currency code, optional active category, active state, and optional product image. Image upload/staging failures, invalid fields, and unavailable currency/category dependencies must be represented.

### Product Detail and Editor — `/catalog/products/[id]`

Displays and edits the same product fields. It supports image replacement or removal, activation/deactivation, and one-way archival according to the product lifecycle. Archived products remain available for historical reference but are no longer editable as active catalog entries. Conflicting edits and unavailable records require safe states.

### Categories — `/catalog/categories`

Creates, searches, filters, lists, and edits bilingual product categories. Each category shows Brazilian Portuguese name, English name, active/inactive state, and number of referencing products.

Deactivating a category requires confirmation. If products reference it, the merchant must choose another active category as replacement; deactivation is blocked when a required replacement is unavailable.

### Store and Account Settings — `/settings`

Combines the merchant's operational settings:

- **Nautt connection**: register, replace, validate, or reset the merchant's own Nautt API credential and communicate connection status without exposing the secret after submission.
- **Checkout data policy**: choose which buyer data the public checkout requires: none, name and email, name/email/CPF, or name/email/CPF/full address.
- **Store identity**: public slug, localized display names, and enabled/disabled storefront state.
- **Store configuration**: selected theme, layout (`boxed` or `table`), accent value, and logo upload/replacement/removal.
- **Payments**: enable or disable standalone custom-amount payments.
- **Default currency**: choose from active supported currency mappings or clear the assignment.
- **Language**: choose `pt-BR` or `en` for the merchant account.

Settings must distinguish unchanged values from explicit clearing, show staged logo outcomes, prevent invalid public-store configurations, and explain when no supported currency is available.

### Profile and Security — `/profile`

Allows the signed-in merchant to manage personal account security:

- Change username and optional email with concurrent-change and uniqueness conflict handling.
- Change password by providing the current password and a valid replacement.
- Enroll in TOTP two-factor authentication, display the provisioning information and one-time recovery codes, confirm the first code, disable TOTP, and regenerate recovery codes.

Recovery codes are shown only when newly issued. Sensitive secrets and password data must never be redisplayed.

## Public Payment Link — `/pay/[identifier]`

This is a sessionless buyer checkout for a merchant-owned payment link. It must support both retained V1 links and Commerce V2 links.

For an available link, the page presents:

- Merchant identity information allowed for public display.
- Product title, description, and price for V1, or localized fixed-amount/product-line composition and total for V2.
- Currency label when available.
- A buyer form containing exactly the fields required by the merchant's checkout data policy: none; name and email; name, email, and CPF; or name, email, CPF, street, number, district, city, Brazilian state, postal code, and optional complement.
- Validation messages without exposing internal causes.
- A submit action that creates the payment attempt and supports safe retry behavior.
- PIX QR code and copy-and-paste payment value when available, including copy feedback.
- Live payment-status updates and manual retry after a polling failure.
- Distinct states for created, pending, indeterminate, confirmed, rejected, cancelled, expired, and refunded payments.
- A completed/paid view for links already settled.
- A privacy notice explaining the collection of buyer data.

Inactive, expired, paid single-use, unknown, or otherwise unavailable links must resolve to a generic unavailable state without exposing why. The checkout also needs loading, submission-in-progress, payment-data-pending, status-error, terminal-payment, and general error states.

## Supported Themes

The product has exactly six supported theme identifiers. The template must support all six, but no theme's visual treatment is prescribed here:

1. `pix-paper`
2. `cashier-daylight`
3. `settlement-sand`
4. `midnight-clearing`
5. `vault-blue`
6. `terminal-amber`

Do not add, remove, rename, merge, or describe these themes. Treat them as selectable theme contexts shared by authenticated surfaces, merchant storefront settings, previews, and public Commerce V2 checkout branding.

## Delivery Expectation

Produce a coherent frontend template covering every page and functional state above. Keep the functional distinctions between administrator, merchant, and public buyer surfaces. Preserve owner isolation, administrator read-only boundaries, bilingual behavior, exact monetary representation, lifecycle constraints, safe unavailable states, and redaction of sensitive/internal data.

You are free to choose the frontend's visual direction and composition. This prompt intentionally defines functionality only.
