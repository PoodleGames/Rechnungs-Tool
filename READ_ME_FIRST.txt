INVOICE TOOL — QUICK START
============================

HOW TO START
--------------
1. Double-click the file "Rechnungstool.html"
   (it opens automatically in your browser, e.g. Microsoft Edge)

2. The first time you open it, a window will appear:
   "Connect the Invoice Tool to your folder"
   -> Click "Choose folder"
   -> Select the folder where this file is located
      (the folder that contains "Rechnungstool.html", "data" and
      "output" — not a subfolder)
   -> Done! You only have to do this ONCE.

3. From now on you can create invoices normally.

THAT'S IT. No installation, nothing to download, nothing else needed.


WHAT THE THREE PAGES DO
--------------------------
- Rechnungstool.html  -> create and edit an invoice
- Kunden.html         -> add, edit, delete customers
- Artikel.html        -> add services/items you can insert into invoices

You can switch between the pages anytime using the buttons in the
top-right corner.


HOW TO SAVE AN INVOICE
--------------------------
There are three buttons in the bottom-right corner:

- "HTML speichern" (Save HTML)
  -> downloads the invoice as a file (into your normal downloads
     folder), the way you might already know.

- "Im Kundenordner ablegen" (File in customer folder)
  -> THIS is the important button for real, sequentially numbered
     invoices! It automatically assigns the next invoice number
     (R-0001, R-0002, R-0003, ...) and saves the invoice straight
     into the right customer folder under "output". Every customer
     automatically gets their own folder.

- "Als PDF exportieren" (Export as PDF)
  -> opens your browser's normal print dialog. There you can choose
     "Save as PDF".


WHERE YOUR DATA LIVES
------------------------
Everything stays on your own computer, inside this folder:

  data/
    kunden.json         -> all your customers
    artikel.json         -> all your services/items
    einstellungen.json   -> your company details, invoice number counter

  output/
    K-00001_Customer_Name/
      Rechnung_R-0001_2026-06-30.html
      Rechnung_R-0005_2026-07-12.html
    K-00002_Another_Customer/
      Rechnung_R-0002_2026-06-30.html

TIP: Back up this whole folder every now and then (e.g. copy it to
a USB stick) so nothing gets lost.


FREQUENTLY ASKED QUESTIONS
------------------------------
"A security prompt from the browser appeared, is that normal?"
-> Yes. The browser is asking, once, whether this page is allowed
   to access your files. That's expected and necessary — it's the
   only way the tool can save your invoices directly to your
   computer. Just click "Allow" / select the folder.

"I'm using Firefox and it doesn't work."
-> Please use Microsoft Edge or Google Chrome instead. Edge comes
   pre-installed on every Windows computer (the blue "e" icon).
   Firefox doesn't currently support the required technology.

"Do I have to choose the folder again every time?"
-> No, only the very first time. After that, the browser remembers
   your choice automatically.

"Can I move or rename the folder?"
-> Yes. You'll just need to select the folder once more afterwards
   (the connection window will simply appear again, once).
