# Luvenza / StyleFit frontend

A responsive React + Vite frontend inspired by the supplied Luvenza reference. The initial route is the login page. After authentication, the application reads the role from the login response and renders the corresponding workspace.

## Stack
- React 18 + Vite
- Tailwind CSS 3
- React Router DOM 6
- Axios with JWT request interceptor
- Zod validation
- Lucide React icons

## Run locally
1. Install Node.js (18+ recommended).
2. Extract this ZIP and open the project folder in VS Code.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and update `VITE_API_URL` if needed:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```
5. Start:
   ```bash
   npm run dev
   ```
6. Create a production build:
   ```bash
   npm run build
   ```

## Authentication contract
The frontend sends:
- `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
- `POST /api/auth/register` with customer fields. It always sends `role: "customer"`; do not allow public users to register themselves as admin, tailor, or delivery partner.

The login response must contain both a JWT and a user object. Supported examples:
```json
{ "token": "JWT_VALUE", "user": { "_id": "...", "username": "Asha", "email": "asha@example.com", "role": "customer" } }
```
or:
```json
{ "data": { "token": "JWT_VALUE", "user": { "_id": "...", "role": "admin" } } }
```
Roles must exactly match backend values:
- `customer`
- `admin`
- `tailor`
- `deliver_partner`

JWT is stored in localStorage and automatically sent as `Authorization: Bearer <token>`. A 401 response clears the local session.

## Role access
- **Customer:** Shop, Customizations, Measurements, Orders, Profile
- **Admin / Fashion Designer:** Studio dashboard, Orders, Customers, Tailors, Delivery Partners, Collections, Design Components, Templates, Customization review
- **Tailor:** Tailor dashboard, Assigned Orders, Profile, Availability, Reports
- **Delivery partner:** Delivery dashboard, My Deliveries, Profile, Availability, Reports

Frontend route guards improve navigation and user experience. They are not a security boundary. Keep `authMiddleware` and `authorizeRoles(...)` on every protected backend route.

## Backend endpoints used

All paths below are relative to `VITE_API_URL`.

### Shared authentication
- `POST /auth/login`
- `POST /auth/register`

### Customer
- `GET /products`
- `GET /measurements`
- `POST /measurements`
- `GET /customizations`
- `POST /customizations`
- `GET /orders`
- `GET /users/profile`
- `PUT /users/profile`

### Admin
- `GET /admin/dashboard/overview`
- `GET /admin/orders`
- `PATCH /admin/orders/:id/assign-tailor` body `{ "tailorId": "..." }`
- `PATCH /admin/orders/:id/assign-delivery` body `{ "deliveryPartnerId": "..." }`
- `PATCH /admin/orders/:id/cancel` body `{ "reason": "..." }`
- `GET /admin/customers`
- `PATCH /admin/customers/:id/status`
- `GET /admin/tailors`
- `PATCH /admin/tailors/:id/status`
- `GET /admin/delivery-partners`
- `PATCH /admin/delivery-partners/:id/status`
- `GET /admin/customizations`
- `PATCH /admin/customizations/:id/status`
- `GET|POST /collections`
- `GET|POST /design-components`
- `GET|POST /templates`

The UI provides a generic action prompt for assignment IDs and status updates. The payload field names match the API contracts discussed for StyleFit. Collection/component/template update and delete controls should be added once the corresponding PUT/DELETE controllers are mounted in your backend.

### Tailor
- `GET /tailor/dashboard/overview`
- `GET /tailor/orders`
- `PATCH /tailor/orders/:id/accept`
- `PATCH /tailor/orders/:id/reject` body `{ "reason": "..." }`
- `PATCH /tailor/orders/:id/status` body `{ "status": "ready_for_delivery" }`
- `GET|PUT /tailor/profile`
- `PATCH /tailor/availability` body `{ "availabilityStatus": "available" }`
- `GET /tailor/dashboard/monthly-report?year=2026&month=11`

### Delivery partner
- `GET /delivery/dashboard/overview`
- `GET /delivery/orders`
- `PATCH /delivery/orders/:id/accept`
- `PATCH /delivery/orders/:id/reject` body `{ "reason": "..." }`
- `PATCH /delivery/orders/:id/status` body `{ "status": "out_for_delivery", "trackingNote": "..." }`
- `GET|PUT /delivery/profile`
- `PATCH /delivery/availability` body `{ "availabilityStatus": "available" }`
- `GET /delivery/dashboard/monthly-report?year=2026&month=11`

## Important backend integration notes
1. Keep the backend role values exactly as listed above. The frontend never trusts a role supplied during public registration.
2. The frontend assumes list endpoints return either an array directly or an object containing `data`, `items`, `results`, `orders`, `customizations`, `customers`, `tailors`, or `deliveryPartners`. Adjust the extraction helper if your controllers use another response shape.
3. The frontend assumes `GET /products` returns product documents with `productName`, `shortContent`, and `pricing.newPrice`.
4. Measurement payload fields are `profileName`, `height`, `bust`, `waist`, `hip`, `shoulder`, `sleeveLength`, `dressLength`, and `unit`.
5. The customization form sends `{ productId, measurementId, customizationName, designOptions }`. It currently uses a JSON text area for `designOptions` so you can map the fields to the exact design schema you chose.
6. A customer confirmation endpoint for designer suggestions was identified as still needed in the backend plan. Add it before exposing a final approve/assign workflow. Suggested path: `PATCH /api/customizations/:id/confirm`.
7. Image upload and actual 3D try-on are not implemented by this frontend scaffold. Connect Multer/cloud storage and your 3D model/viewer service when those backend features are ready.
8. Do not expose all admin/tailor/delivery records to the browser. Return only the fields needed by the signed-in role, and always enforce ownership on the server.

## Folder structure
```text
src/
  components/       reusable tables, status badges, protected routes
  context/          authentication context
  layouts/          role-aware application shell and navigation
  pages/            login, customer, admin, tailor and delivery pages
  schemas/          Zod schemas
  services/         Axios instance and JWT interceptor
  App.jsx
  main.jsx
```

## Before testing
- Start your Express/MongoDB backend.
- Confirm CORS allows the Vite origin (usually `http://localhost:5173`).
- Confirm the login controller returns `{ token, user }`.
- Create staff accounts through the admin/database workflow; do not register staff through the public registration page.
- Use separate Postman accounts/tokens for customer, admin, tailor and delivery partner.
