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

### Record Movement

Use this screen when something happens to stock.

Examples:

- delivery arrived
- stock was used
- stock moved to another place
- a hand count found a difference
- a mistake needs to be reversed

### Send Work

Use this screen to send local work.

If the device is offline, work stays safely saved on the device.

When the device is online, click `Send Work` or `Send Saved Work`.

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

If a movement was wrong, use `Reverse`. The old movement stays visible, and the system adds a new movement that cancels it.

### Count Check

Use this screen after a physical count.

Enter the number you counted by hand. If the hand count is different from the system count, click `Save Correction`.

The system does not hide the old number. It adds a correction movement so the reason stays visible.

## 5. The Five Actions

### Add Delivery

Use this when stock comes in.

Example:

```text
12 cases of Tonic Water arrived at Dry Store.
```

Choose where the stock arrived.

### Record Use

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

### Correct Count

Use this when a hand count is different from the system count.

Use a plus number to add stock:

```text
+2
```

Use a minus number to subtract stock:

```text
-1
```

### Reverse Mistake

Use this when a previous movement was wrong.

Choose the original movement. StockLedger will add a new reversing movement.

The original record is not deleted.

## 6. Record a Movement

Go to `Record Movement`.

Fill in the form:

1. Choose `What Happened?`
2. Choose the product.
3. Choose the needed place or places.
4. Enter the quantity.
5. Write the reason.
6. Click `Save Movement`.

After saving, the movement goes to `Send Work`.

## 7. Send Work

Go to `Send Work`.

If the top button says `Offline`, click it once so it says `Online`.

Then click `Send Work` or `Send Saved Work`.

If sending works, the system shows:

```text
saved movement(s) sent successfully
```

If sending does not work, read the message on screen and fix the highlighted movement.

## 8. Good Reasons to Write

Use short, clear reasons.

Good examples:

```text
Supplier delivery accepted
Evening service use
Moved to Main Bar for opening
Physical count difference
Correcting wrong product entry
```

Avoid vague reasons:

```text
ok
done
adjusted
fixed
```

## 9. If You Make a Mistake

Do not delete history.

Use one of these:

- `Reverse` if one old movement was wrong.
- `Correct Count` if the current stock does not match the hand count.

This keeps the audit trail honest.

## 10. Offline Work

You can keep working while offline.

When offline:

- new movements are saved on this device
- movements wait in `Send Work`
- stock on this device includes the saved movements
- nothing is sent until the device is online

When online:

- click `Send Work`
- the server accepts the whole batch or rejects the whole batch
- duplicate movements are ignored safely

## 11. Daily Work Pattern

Use this simple order:

1. Open `Stock Overview`.
2. Check `Total Stock`.
3. Check `By Location` if you need one area.
4. Record deliveries, use, moves, or count corrections.
5. Go to `Send Work`.
6. Switch to `Online`.
7. Click `Send Work`.
8. Use `History` if something looks wrong.

## 12. Words Used in the System

| Word | Meaning |
| --- | --- |
| Movement | Something that happened to stock |
| Batch | A group of saved movements sent together |
| Outbox | Work saved on this device and waiting to send |
| History | The full list of stock movements |
| Correction | A new movement that fixes a count difference |
| Reverse | A new movement that cancels an earlier mistake |
| Duplicate Check | A safety key that prevents sending the same movement twice |

## 13. Remember

- Record what happened.
- Do not overwrite final stock.
- Send work when online.
- Fix mistakes with a new movement.
- Use the history screen when a number needs explaining.
