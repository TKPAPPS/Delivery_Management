# The Kosher Place — Delivery App: User Guide

A plain-language guide to the delivery app, covering every menu item.

## 1. The big picture (read this first)

The app turns **sales orders into tracked deliveries**. The normal life of a delivery is:

> **An order comes in → you turn it into a delivery card → you book a driver/courier → you mark it delivered → it moves to History.**

Two key ideas:
- An **Order** = a request from a customer (most come in automatically from Odoo, your sales system).
- A **Delivery Card** = one shipment you're coordinating. A card can carry **several customers/orders** going out together.

## 2. Signing in

1. Go to the app and click **Sign in with Google**.
2. First time? Your account starts **inactive** — an admin has to switch you on before you can see anything. You'll land on a "pending" screen until then.
3. Once active, you land on the **Dashboard**.

## 3. The screen layout

- **Top bar:** the TKP logo (click it to go to the Dashboard), your name/account on the right, and **Sign out**.
- **Left menu:** split into **Operations** (everyone sees these) and **Admin** (only admins and logistics staff see these).

### What each role sees
- **Staff** (most users): the Operations menu only.
- **Logistics**: Operations + some Admin items (Customers, Drivers, Couriers, Cargo Co., Destinations).
- **Admin**: everything.

---

## 4. OPERATIONS menu

### 4.1 Dashboard
Your home screen — a quick health check of everything in motion.

- **Stat cards** across the top: **Draft**, **Pending Booking**, **Booked**, **In Transit**, **Urgent**, and **Delivered This Month**. Click any card to jump to the relevant list.
- **Draft / Planning Queue** panel: deliveries not yet started.
- **Upcoming Deliveries**: anything with a planned date in the next 14 days.
- **Recently Updated**: the latest activity.
- **Awaiting Driver**: cards that have been waiting longest for a driver — your "chase these" list.
- **New Card** button (top right) to create a delivery on the spot.

*This screen updates itself live as the team works — no need to refresh.*

### 4.2 Orders (the Orders Pool)
Every incoming order, mostly synced from Odoo. This is where deliveries are born.

- **Default view** shows **Active (unassigned)** orders — the ones that still need handling. Already-handled orders are hidden.
- **Search box**: find by order reference, customer, destination, or notes.
- **Filters**: Status (Active / All / Pending / Assigned / etc.), Priority (1–5), and Source (Manual / Odoo).
- **Pages**: the list is paginated (50 per page) with **Prev / Next** at the bottom — it stays fast even with thousands of orders.

**How to turn orders into a delivery:**
1. Tick the checkbox next to one or more orders (you can combine several into one shipment).
2. Click **Create Delivery**. This makes one **draft delivery card** with each order as a customer on it, and takes you to that card.

**Other buttons:**
- **New Order** — manually add an order that didn't come from Odoo.
- **Sync from Odoo** (admin) — pull the latest orders from Odoo right now.
- Click any order's reference to open its **detail page** (edit it, see its line items, see its history). If an order is already on a delivery, there's a link to that card.

### 4.3 Board (the Kanban board)
Your live delivery wall. Each card is one shipment, sitting in a column for its stage.

**Columns (left to right):** Draft → Pending Booking → Booked → In Transit.
*(Delivered cards leave the board and go to History.)*

- **Move a card:** drag it to the next column to change its stage. On a phone, use the dropdown on each card instead.
- **Search** narrows the board by destination, reference, driver, customer, or sale-order number.
- **New Card** creates a delivery from scratch.
- **Tip:** when you assign a driver to a Draft or Pending-Booking card, the app **automatically moves it to Booked** for you.
- Click a card to open its **full detail** (see section 6).

### 4.4 Planning Queue
A focused list of **Draft** deliveries — things you're still preparing before they hit the board properly.

- **Add to Queue** creates a new draft.
- **To Board** promotes a draft to Pending Booking (it starts moving through the pipeline).
- **Reorder** drafts by dragging to set priority.

*The Planning Queue, the Dashboard "Draft" panel, and the board's Draft column are all the same drafts — change it in one place and it updates everywhere.*

### 4.5 History
Everything that's finished or put away.

- Shows **delivered** and **archived** cards.
- **Deleted tab** (admin only): cards that were removed can be **restored** from here. Nothing is ever truly gone.

---

## 5. ADMIN menu

### 5.1 Users *(admin only)*
Manage who can use the app.
- See everyone who's signed up.
- **Activate** a new person so they can get in (new sign-ups start switched off).
- Set each person's **role**: **Admin**, **Logistics**, or **Staff**.

### 5.2 Customers *(admin + logistics)*
Your reusable **Customer Directory** — name, email, contact number, address, and a default delivery location.
- **Add / Edit** a customer.
- The **email** here is what receives the automatic delivery emails, so keep it correct.
- **Delete** removes a directory entry.
- Customers also get created automatically the first time an Odoo order for them becomes a delivery.

### 5.3 Drivers *(admin + logistics)*
Your driver roster — name, phone, vehicle type, license plate. Add the drivers you assign to car deliveries here so you can pick them from a list.

### 5.4 Couriers *(admin + logistics)*
The list of **post/courier companies** (e.g. for parcel deliveries with tracking numbers).

### 5.5 Cargo Co. *(admin + logistics)*
The list of **air cargo companies** (for air freight with waybills and flight numbers).

### 5.6 Communications *(admin only)*
Controls the **LINE messages** the app sends to your team groups.
- **Master switch** at the top: turn all automatic LINE messages on or off instantly.
- **Groups**: each LINE group the bot is in. Tick which events each group should receive (e.g. "card booked", "driver assigned").
- **Test button** to send a test message and confirm a group is wired up.
- A panel shows recent message attempts so you can see what was sent or skipped.

### 5.7 Msg Templates *(admin only)*
The **email templates sent to customers** at each delivery stage.
- One editable template per stage (e.g. booked, in transit, delivered).
- You can use placeholders like `{{customer_name}}`, `{{driver_name}}`, `{{destination}}`, `{{delivery_ref}}` — the app fills them in automatically.

### 5.8 Odoo Sync *(admin only)*
Bring orders in from Odoo and keep the pool tidy.
- **Configuration** panel: shows whether the Odoo connection is set up.
- **Sync Now**: pull recent changes. **Full resync** re-pulls everything. **Sync since** lets you pick a start date.
- **Reconcile open orders**: re-checks every open order against Odoo and removes the ones already **invoiced (delivered)** or **cancelled** — so the pool only shows real work.
  - **Preview (dry run)** shows how many would be removed, without changing anything.
  - **Reconcile now** removes them (it asks you to confirm first). It's reversible — removed orders are only hidden, not destroyed.
- **Recent syncs**: a log of past syncs; click a row to see any errors.

### 5.9 Destinations *(admin + logistics)*
Manage your list of delivery **destinations/areas** (e.g. Bangkok, Koh Samui, Phuket) that you pick from when creating deliveries.

---

## 6. Inside a Delivery Card (the detail page)

Open any card (from the Board, Dashboard, or Orders) to manage everything about that shipment:

- **Customers**: the people/companies on this shipment, each with their sale orders and extra items. You can **add**, **edit**, **move a customer to another card**, or **remove** one. (Move an order's customer and the order follows it; remove the last customer and the empty card tidies itself away.)
- **Logistics**: choose the **delivery method** — **Car** (pick a driver), **Post** (courier + tracking number), **Air** (cargo company + waybills + flight), or **Other**. For "Other" you can also set a motorcycle **delivery type** (our motorcycle vs a delivery company's).
- **Status actions**: move the card through its stages, and **Mark as Delivered** when it's done. Delivering a card emails the customers, completes the linked orders, and drops the card into History.
- **Comments**: an internal chat thread for the team about this delivery.
- **Attachments**: upload photos, PDFs, invoices, etc. (up to 20 MB each).
- **Communications panel**: manually send a LINE message or email about this card, or send an **email summary** with attachment links.
- **Activity log**: an automatic, unchangeable record of everything that happened to this card.
- **Print**: a clean printable version of the card.

---

## 7. Your account & signing out
- Click **your name** (top right) to open your **Account** page and see your profile details.
- Click **Sign out** to leave.

---

## 8. A few things worth knowing
- **Live updates:** screens refresh themselves as teammates make changes.
- **Dates** show as day/month/year.
- **Nothing is truly deleted:** removed cards and orders are hidden and can be brought back.
- **Two kinds of messages:** customers get **emails** (per stage); your team gets **LINE messages** (controlled in Communications).
- **Odoo is read-only:** the app reads orders from Odoo but never changes anything in Odoo.
