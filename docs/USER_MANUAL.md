# StockLedger User Manual

This manual explains how to use the local StockLedger prototype in simple words.

StockLedger helps you record inventory movement. It does not ask you to type the final stock number. You record what happened, and the system calculates the stock from those records.

## 1. Start the System

From the project folder, run:

```bash
npm install
npm run dev
```

Open this address in your browser:

```text
http://127.0.0.1:5173
```

If the system is already running, just open the same address.

## 2. The Main Rule

Do not overwrite stock.

Do not write:

```text
Gin stock is now 10.
```

Write what happened:

```text
24 bottles of gin arrived in Dry Store.
8 bottles moved from Dry Store to Main Bar.
3 bottles were used from Main Bar.
```

StockLedger keeps every movement in history. This makes it easier to audit, because anyone can see how a stock number was created.

## 3. What to Look at First

Start on `Stock Overview`.

Look at these items in order:

1. `Total Stock`
2. `By Location`
3. `Low Stock`
4. `Waiting to Send`

Use the `Guide` button when you are not sure what to do next.

## 4. Main Screens

### Stock Overview

Use this screen first.

It shows:

- total stock across all locations
- stock in one selected location
- a detailed product-and-location list
- low stock and review flags

The numbers are calculated from saved movements.

### Stock Actions

Use this screen when you need to prepare work.

Examples:

- stock came in
- stock was used
- stock moved to another place
- a hand count found a difference
- a previous record needs to be reversed
- a product needs to be enrolled, suspended, or reactivated

If the device is offline, work stays safely saved on the device.

The left side is the action form. The right side is `Work to Send`.

Important: saved work is sent as one batch. If one movement has a problem, the whole batch is stopped so stock history stays clean.

### History

Use this screen when you need to check what happened.

It shows:

- action
- product
- location
- quantity change
- new balance
- person who recorded it
- batch reference

If a movement was wrong, use `Prepare reverse record`. This opens `Stock Actions` with `Reverse a Record` selected. Review it and write a reason before saving.

### Products

Use this screen to review the product catalog.

Enroll, suspend, and reactivate products from `Stock Actions` so product work joins the same batch as stock work.

## 5. Stock Actions

### Stock In

Use this when stock comes in.

Example:

```text
12 cases of Tonic Water arrived at Dry Store.
```

Choose where the stock arrived.

### Stock Use

Use this when stock leaves a place.

Examples:

- sold
- used during service
- wasted
- broken

Choose where the stock left from.

### Move Stock

Use this when stock moves from one place to another.

Example:

```text
8 bottles of Juniper Gin moved from Dry Store to Main Bar.
```

Choose both places:

- `Where From?`
- `Where To?`

### Correct Stock Count

Use this when a hand count is different from the system count.

Enter the number you counted by hand. The system shows the current count and calculates the correction.

### Reverse a Record

Use this when a previous movement was wrong.

Choose the original movement. StockLedger will add a new reversing movement.

The original record is not deleted.

### Enroll Product

Use this when a product should be added to the catalog.

After saving, the product appears locally and the enrollment waits in `Work to Send`.

### Suspend Product

Use this when a product should stop appearing in stock actions.

If the product still has replayed stock, StockLedger queues grouped closure work so the stock balance is closed through audit-visible records.

### Reactivate Product

Use this when a suspended product should be selectable again.

Reactivation does not create stock movement.

## 6. Prepare and Send Work

Go to `Stock Actions`.

Fill in the form:

1. Choose `Action Type`.
2. Choose the product.
3. Choose the needed place or places.
4. Enter the quantity.
5. Write the reason.
6. Click `Save Action`.

After saving, the item appears in `Work to Send` on the right side.

If the top account menu says `Offline`, open it and switch to `Online`.

Then click `Send Saved Work` in `Work to Send`.

If sending works, the system shows:

```text
saved movement(s) sent successfully
```

If sending does not work, read the message on screen and fix the highlighted movement.

You can undo only work that has not been sent yet. After sending, use `Reverse a Record` or `Correct Stock Count`.

## 7. Good Reasons to Write

Use short, clear reasons.

Good examples:

```text
Supplier delivery accepted
Evening service use
Moved to Main Bar for opening
Physical count difference
Correcting wrong product entry
Seasonal product suspended
```

Avoid vague reasons:

```text
ok
done
adjusted
fixed
```

## 8. If You Make a Mistake

Do not delete history.

Use one of these:

- `Reverse a Record` if one old movement was wrong.
- `Correct Stock Count` if the current stock does not match the hand count.

This keeps the audit trail honest.

## 9. Offline Work

You can keep working while offline.

When offline:

- new work is saved on this device
- work waits in `Work to Send`
- stock on this device includes the saved stock movements
- nothing is sent until the device is online

When online:

- click `Send Saved Work`
- the server accepts the whole batch or rejects the whole batch
- duplicate movements are ignored safely

## 10. Daily Work Pattern

Use this simple order:

1. Open `Stock Overview`.
2. Check `Total Stock`.
3. Check `By Location` if you need one area.
4. Open `Stock Actions`.
5. Prepare stock or product work.
6. Check `Work to Send`.
7. Switch to `Online`.
8. Click `Send Saved Work`.
9. Use `History` if something looks wrong.

## 11. Words Used in the System

| Word | Meaning |
| --- | --- |
| Movement | Something that happened to stock |
| Work to Send | Work saved on this device and waiting to send |
| Batch | A group of saved work sent together |
| History | The full list of stock movements |
| Correction | A new movement that fixes a count difference |
| Reverse | A new movement that cancels an earlier mistake |
| Duplicate Check | A safety key that prevents sending the same movement twice |

## 12. Remember

- Record what happened.
- Do not overwrite final stock.
- Send work when online.
- Fix mistakes with a new movement.
- Use the history screen when a number needs explaining.
