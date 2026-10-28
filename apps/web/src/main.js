import "./style.css";

const icons = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`,
  invoices: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`,
  vendors: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M16 4.5a4 4 0 0 1 0 7.5M18 15a5 5 0 0 1 3.5 4.8V21"/></svg>`,
  payments: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M7 15h3"/></svg>`,
  gst: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.9-1.5 2.6-1.4-.5a8 8 0 0 1-1.7 1l-.2 1.5h-3l-.3-1.5a8 8 0 0 1-1.7-1l-1.4.5-1.5-2.6 1.2-1a7 7 0 0 1 0-2l-1.2-1L7.6 9l1.4.5a8 8 0 0 1 1.7-1L11 7h3l.3 1.5a8 8 0 0 1 1.7 1l1.4-.5 1.5 2.6-1.2 1a7 7 0 0 1-.3 2.4Z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>`
};

const vendors = [
  ["Apex Office Solutions", "29AABCA1234F1Z5", "Office supplies", "â‚¹1,24,500", "Active"],
  ["Bluewave Technologies", "29AACCB5678K1Z2", "IT & software", "â‚¹82,600", "Active"],
  ["Prime Industrial Supplies", "29AABCP2345D1Z8", "Industrial", "â‚¹56,300", "Active"],
  ["Vertex Business Services", "29AACCV3456G1Z4", "Professional services", "â‚¹0", "Active"],
  ["Nova Packaging Co.", "29AAACN7890M1Z1", "Packaging", "â‚¹12,600", "Active"]
];

let currentPage = "Dashboard";
let invoices = [];
let selectedInvoice = null;
let invoicesLoaded = false;
let extracted = null;
let gstReportData = null;
let gstReportFrom = "";
let gstReportTo = "";
let gstReportLoading = false;
let vendorsData = [];
let paymentsData = [];
let vendorsLoaded = false;
let paymentsLoaded = false;
let vendorsLoading = false;
let paymentsLoading = false;
let vendorFormOpen = false;
let paymentFormOpen = false;
let toastTimer;

const money = n => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
}).format(Number(n) || 0);

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));

function apiInvoiceToUi(row) {
  const invoiceDate = row.invoice_date ? String(row.invoice_date).slice(0, 10) : "";
  const dateLabel = invoiceDate
    ? new Date(`${invoiceDate}T00:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "â€”";

  const statusClasses = {
    "Pending approval": "amber",
    Approved: "green",
    Rejected: "red",
    Overdue: "red",
    Paid: "blue",
    Processing: "purple"
  };

  return {
    dbId: row.id,
    id: row.invoice_number,
    invoiceNumber: row.invoice_number,
    vendor: row.vendor_name || "",
    date: dateLabel,
    invoiceDate,
    amount: Number(row.total_amount) || 0,
    status: row.status || "Pending approval",
    cls: statusClasses[row.status] || "amber",
    gst: row.gstin || "",
    cgst: Number(row.cgst) || 0,
    sgst: Number(row.sgst) || 0,
    igst: Number(row.igst) || 0,
    taxable_value: row.taxable_value == null ? "" : Number(row.taxable_value),
    discount_amount: Number(row.discount_amount) || 0,
    other_charges: Number(row.other_charges) || 0,
    cess: Number(row.cess) || 0,
    source: row.source || ""
  };
}

async function loadInvoicesFromApi() {
  try {
    const response = await fetch("/ap-api/api/v1/invoices");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || `Invoice request failed (${response.status})`);
    }

    invoices = (body.invoices || []).map(apiInvoiceToUi);
    invoicesLoaded = true;
    renderPage();
  } catch (error) {
    invoicesLoaded = false;
    invoices = [];
    renderPage();
    toast(`Could not load invoices from the database: ${error.message}`, true);
  }
}

function shell() {
  document.querySelector("#app").innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">H</div>
        <div>
          <div class="brand-name">HRS <span>TECH</span></div>
          <div class="brand-sub">INTELLIGENT FINANCE</div>
        </div>
      </div>
      <div class="workspace-label">WORKSPACE</div>
      <nav id="navigation">
        ${navItem("Dashboard", "dashboard")}
        ${navItem("Invoices", "invoices")}
        ${navItem("Vendors", "vendors")}
        ${navItem("Payments", "payments")}
        ${navItem("GST Reports", "gst")}
      </nav>
      <div class="sidebar-bottom">
        <div class="ai-card">
          <div class="ai-icon">âœ¦</div>
          <div><b>AI Assistant</b><p>Invoice intelligence is ready.</p><span class="online-dot"></span> Extraction service</div>
        </div>
        <div class="profile">
          <div class="avatar">HR</div>
          <div class="profile-info"><b>HRS Administrator</b><small>Finance Admin Â· Demo</small></div>
          <span>Admin</span>
        </div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="crumb">Workspace <span>/</span> <b id="crumb">Dashboard</b></div>
        <div class="top-actions">
          <span class="environment"><i></i> DEMO ENVIRONMENT</span>
          <button class="icon-btn" title="Notifications">â™§<i class="notify-dot"></i></button>
          <div class="avatar small">HR</div>
        </div>
      </header>
      <section class="content" id="content"></section>
      <footer>Â© 2026 HRS TECH AI Solutions <span>AI-powered accounts payable Â· Demonstration environment</span></footer>
    </main>
    <input type="file" id="invoiceFile" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden />
    <div id="toast" class="toast" role="status"></div>
  `;

  document.querySelector("#navigation").addEventListener("click", event => {
    const item = event.target.closest("[data-page]");
    if (item) navigate(item.dataset.page);
  });

  document.querySelector("#invoiceFile").addEventListener("change", uploadInvoice);
  navigate("Dashboard");
}

function navItem(label, icon, count = "") {
  return `<button class="nav-item ${label === "Dashboard" ? "active" : ""}" data-page="${label}">
    <span class="nav-icon">${icons[icon]}</span>
    <span>${label}</span>
    ${count ? `<span class="nav-count">${count}</span>` : ""}
  </button>`;
}

function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(element => {
    element.classList.toggle("active", element.dataset.page === page);
  });
  const crumb = document.querySelector("#crumb");
  if (crumb) crumb.textContent = page;
  renderPage();
}

function heading(title, description, action = "") {
  return `<div class="page-heading">
    <div><div class="eyebrow">HRS TECH / FINANCE</div><h1>${title}</h1><p>${description}</p></div>
    ${action}
  </div>`;
}

function button(label, action, secondary = false) {
  return `<button type="button" class="btn ${secondary ? "btn-secondary" : ""}" data-action="${action}">${label}</button>`;
}

function status(text, cls) {
  return `<span class="status ${escapeHtml(cls || "amber")}"><i></i>${escapeHtml(text)}</span>`;
}

function invoiceTable(items = invoices) {
  return `<div class="table-wrap">
    <table>
      <thead><tr>
        <th>INVOICE</th><th>VENDOR</th><th>INVOICE DATE</th><th>AMOUNT</th><th>STATUS</th><th>ACTIONS</th>
      </tr></thead>
      <tbody>
        ${items.map(invoice => `<tr>
          <td><b class="invoice-id">${escapeHtml(invoice.id)}</b><small>Purchase invoice</small></td>
          <td><span class="vendor-avatar">${escapeHtml((invoice.vendor || "?").slice(0, 1))}</span><span class="vendor-name">${escapeHtml(invoice.vendor)}</span></td>
          <td>${escapeHtml(invoice.date)}</td>
          <td class="amount">${money(invoice.amount)}</td>
          <td>${status(invoice.status, invoice.cls)}</td>
          <td><button type="button" class="dots" data-invoice-id="${escapeHtml(String(invoice.dbId ?? ""))}" title="View invoice details" aria-label="View details for invoice ${escapeHtml(invoice.id)}">â‹®</button></td>
        </tr>`).join("")}
      </tbody>
    </table>
    ${items.length ? "" : `<p class="empty-state">No invoices match your search or filter.</p>`}
  </div>`;
}

function renderPage() {
  const content = document.querySelector("#content");
  if (!content) return;

  if (currentPage === "Dashboard") content.innerHTML = dashboard();
  else if (currentPage === "Invoices") content.innerHTML = invoicesPage();
  else if (currentPage === "Vendors") content.innerHTML = vendorsPage();
  else if (currentPage === "Payments") content.innerHTML = paymentsPage();
  else if (currentPage === "GST Reports") content.innerHTML = gstPage();
  else content.innerHTML = dashboard();

  if (currentPage === "Vendors" && !vendorsLoaded && !vendorsLoading) {
    void loadVendorsFromApi();
  }
  if (currentPage === "Payments" && !paymentsLoaded && !paymentsLoading) {
    void loadPaymentsFromApi();
  }

  content.querySelectorAll("[data-action]").forEach(element => {
    element.addEventListener("click", () => runAction(element.dataset.action));
  });

  // Delegation keeps invoice-detail buttons working after search/filter redraws.
  content.onclick = event => {
    const detailButton = event.target.closest("[data-invoice-id]");
    if (!detailButton || !content.contains(detailButton)) return;

    const invoiceId = detailButton.dataset.invoiceId;
    const found = invoices.find(invoice => String(invoice.dbId ?? "") === invoiceId);
    if (!found) {
      toast("This invoice could not be matched to a database record. Refresh the invoice list.", true);
      return;
    }

    selectedInvoice = found;
    currentPage = "Invoices";
    document.querySelectorAll(".nav-item").forEach(element => {
      element.classList.toggle("active", element.dataset.page === "Invoices");
    });
    document.querySelector("#crumb").textContent = "Invoices";
    renderPage();
  };

  const search = content.querySelector("#invoiceSearch");
  const filter = content.querySelector("#statusFilter");

  const redrawInvoiceRows = () => {
    const query = (search?.value || "").trim().toLowerCase();
    const statusFilter = filter?.value || "All";

    const filtered = invoices.filter(invoice => {
      const matchesQuery = `${invoice.id} ${invoice.vendor} ${invoice.status}`
        .toLowerCase().includes(query);
      const matchesStatus = statusFilter === "All" || invoice.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    const rows = content.querySelector("#invoiceRows");
    if (rows) rows.innerHTML = invoiceTable(filtered);
  };

  if (search) search.addEventListener("input", redrawInvoiceRows);
  if (filter) filter.addEventListener("change", redrawInvoiceRows);

  const gstMonth = content.querySelector("#gstMonth");
  if (gstMonth) {
    gstMonth.addEventListener("change", () => {
      if (!gstMonth.value) return;
      const [year, month] = gstMonth.value.split("-");
      const from = `${year}-${month}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
      const fromInput = content.querySelector("#gstFromDate");
      const toInput = content.querySelector("#gstToDate");
      if (fromInput) fromInput.value = from;
      if (toInput) toInput.value = to;
    });
  }
}

function dashboard() {
  const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const pending = invoices.filter(invoice => invoice.status === "Pending approval").length;
  const overdueValue = invoices
    .filter(invoice => invoice.status === "Overdue")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  return `${heading("Dashboard", "Here's what's happening with your accounts payable today.", button("+ Upload invoice", "upload"))}
    <div class="demo-notice"><span>i</span><div><b>${invoicesLoaded ? "Live invoice register" : "Invoice database unavailable"}</b><span>${invoicesLoaded ? "Figures below are calculated from loaded database invoices." : "Reconnect the API to load live invoice data."}</span></div><span class="notice-tag">SANDBOX</span></div>
    <div class="section-heading"><div><h2>Financial overview</h2><p>Your AP performance at a glance</p></div><span class="date-chip">October 2026</span></div>
    <div class="stats-grid">
      ${stat("Total invoices", String(invoices.length), "INV", "blue-bg", "Database records", "Current register")}
      ${stat("Total invoice value", money(total), "â‚¹", "violet-bg", "Loaded invoices", "Total invoice amount")}
      ${stat("Awaiting approval", String(pending), "Pending", "amber-bg", "Needs attention", "Review pending invoices")}
      ${stat("Overdue payables", money(overdueValue), "!", "red-bg", "Action required", "Based on invoice statuses")}
    </div>
    <div class="dashboard-grid">
      <section class="panel invoice-panel">
        <div class="panel-head"><div><h2>Recent invoices</h2><p>Latest activity across your AP register</p></div><button class="text-btn" data-action="view-invoices">View all invoices â†’</button></div>
        ${invoiceTable(invoices.slice(0, 5))}
        <div class="table-foot"><span>Showing ${Math.min(invoices.length, 5)} of ${invoices.length} records</span><span>${invoicesLoaded ? "Database connected" : "Database unavailable"}</span></div>
      </section>
      <section class="panel workflow-panel">
        <div class="panel-head"><div><h2>Invoice workflow</h2><p>Processing overview</p></div><span class="spark">âœ¦ AI</span></div>
        ${workflowRow("Received", invoices.length, 100, "wf-blue")}
        ${workflowRow("Processing", invoices.filter(invoice => invoice.status === "Processing").length, 35, "wf-purple")}
        ${workflowRow("Pending approval", pending, 55, "wf-amber")}
        ${workflowRow("Approved", invoices.filter(invoice => invoice.status === "Approved").length, 75, "wf-green")}
        <div class="ai-promo"><div class="ai-promo-icon">âœ¦</div><div><b>Smart invoice capture</b><p>Extract supplier and tax details from a PDF or image using your running OCR service.</p><button data-action="upload" class="text-btn">Try invoice extraction â†’</button></div></div>
      </section>
    </div>
    ${extracted ? extractionCard() : ""}`;
}

function stat(title, value, icon, bg, label, sub) {
  return `<div class="stat-card"><div class="stat-top"><span>${escapeHtml(title)}</span><span class="stat-icon ${escapeHtml(bg)}">${escapeHtml(icon)}</span></div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-bottom"><span>${escapeHtml(label)}</span><small>${escapeHtml(sub)}</small></div></div>`;
}

function workflowRow(label, count, width, cls) {
  return `<div class="workflow-row"><div><span>${escapeHtml(label)}</span><b>${count}</b></div><div class="progress"><i class="${escapeHtml(cls)}" style="width:${width}%"></i></div></div>`;
}

function invoiceDetailsCard(invoice) {
  const fields = [
    ["Invoice number", invoice.invoiceNumber || invoice.id],
    ["Vendor", invoice.vendor],
    ["GSTIN", invoice.gst || "Not provided"],
    ["Invoice date", invoice.date],
    ["Taxable value after discount", invoice.taxable_value],
    ["Discount amount", invoice.discount_amount],
    ["CGST", invoice.cgst],
    ["SGST", invoice.sgst],
    ["IGST", invoice.igst],
    ["Other charges", invoice.other_charges],
    ["Cess", invoice.cess],
    ["Invoice total", invoice.amount],
    ["Status", invoice.status],
    ["Source", invoice.source || "Not provided"]
  ];

  const moneyFields = new Set([
    "Taxable value after discount", "Discount amount", "CGST", "SGST",
    "IGST", "Other charges", "Cess", "Invoice total"
  ]);

  return `<section class="panel list-panel">
    <div class="panel-head">
      <div><h2>Invoice tax details</h2><p>${escapeHtml(invoice.invoiceNumber || invoice.id)}</p></div>
      <button type="button" class="btn btn-secondary" data-action="close-invoice-details">Close details</button>
    </div>
    <div class="extraction-grid">
      ${fields.map(([label, value]) => {
        const missing = value == null || value === "";
        const display = missing
          ? "Not provided"
          : moneyFields.has(label) && label !== "Invoice total" && label !== "Taxable value after discount"
            ? money(value)
            : label === "Invoice total" || label === "Taxable value after discount"
              ? money(value)
              : String(value);
        return `<div class="extraction-field"><label>${escapeHtml(label)}</label><div>${escapeHtml(display)}</div></div>`;
      }).join("")}
    </div>
  </section>`;
}

function invoicesPage() {
  return `${heading("Invoices", "Capture, review and manage your supplier invoices.", button("+ Upload invoice", "upload"))}
    <div class="demo-notice"><span>i</span><div><b>${invoicesLoaded ? "Live invoice register" : "Invoice register"}</b><span>${invoicesLoaded ? "Invoices are loaded from the AP PostgreSQL database." : "The database could not be reached. Check the API connection."}</span></div><span class="notice-tag">SANDBOX</span></div>
    ${selectedInvoice ? invoiceDetailsCard(selectedInvoice) : ""}
    <div class="panel list-panel">
      <div class="list-toolbar">
        <div class="search-box">Search: <input id="invoiceSearch" placeholder="Search invoice or vendor..." /></div>
        <select id="statusFilter" class="select">
          <option>All</option><option>Pending approval</option><option>Approved</option><option>Rejected</option><option>Overdue</option><option>Paid</option><option>Processing</option>
        </select>
      </div>
      <div id="invoiceRows">${invoiceTable()}</div>
      <div class="table-foot"><span>${invoices.length} records in database</span><span>Upload a test invoice to try OCR</span></div>
    </div>
    ${extracted ? extractionCard() : ""}`;
}

async function loadVendorsFromApi() {
  if (vendorsLoading) return;
  vendorsLoading = true;

  try {
    const response = await fetch("/ap-api/api/v1/vendors");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Vendor request failed.");
    vendorsData = Array.isArray(body.vendors) ? body.vendors : [];
    vendorsLoaded = true;
  } catch (error) {
    toast(`Could not load vendors: ${error.message}`, true);
  } finally {
    vendorsLoading = false;
    if (currentPage === "Vendors") renderPage();
  }
}

async function loadPaymentsFromApi() {
  if (paymentsLoading) return;
  paymentsLoading = true;

  try {
    const response = await fetch("/ap-api/api/v1/payments");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Payment request failed.");
    paymentsData = Array.isArray(body.payments) ? body.payments : [];
    paymentsLoaded = true;
  } catch (error) {
    toast(`Could not load payments: ${error.message}`, true);
  } finally {
    paymentsLoading = false;
    if (currentPage === "Payments") renderPage();
  }
}

function vendorsPage() {
  const active = vendorsData.filter(v => v.is_active).length;
  const openBalance = vendorsData.reduce((sum, v) => sum + Number(v.open_balance || 0), 0);

  return `${heading("Vendors", "Manage supplier information and payable relationships.",
      button(vendorFormOpen ? "Cancel" : "+ Add vendor", vendorFormOpen ? "vendor-cancel" : "vendor-add"))}
    ${!vendorsLoaded
      ? `<div class="panel form-panel"><p class="empty-state">Loading vendors from the database...</p></div>`
      : `<div class="stats-grid compact-stats">
          ${stat("Total vendors", String(vendorsData.length), "V", "blue-bg", "Database records", "Supplier directory")}
          ${stat("Active vendors", String(active), "OK", "green-bg", "Database status", "Active suppliers")}
          ${stat("Open balances", money(openBalance), "₹", "amber-bg", "Linked invoices only", "Unlinked invoices are excluded")}
        </div>`}
    ${vendorFormOpen ? `
      <div class="panel form-panel">
        <div class="panel-head"><div><h2>Add vendor</h2><p>Supplier details will be saved to the database.</p></div></div>
        <form id="vendorForm" class="data-form">
          <label>Vendor name *<input name="vendor_name" required maxlength="200" autocomplete="organization"></label>
          <label>GSTIN<input name="gstin" maxlength="15" pattern="[0-9A-Za-z]{15}" title="Enter a 15-character GSTIN"></label>
          <label>Email<input name="email" type="email" maxlength="254" autocomplete="email"></label>
          <label>Phone<input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
          <div class="form-actions"><button type="button" class="btn" data-action="vendor-save">Save vendor</button>
          <button type="button" class="btn btn-secondary" data-action="vendor-cancel">Cancel</button></div>
        </form>
      </div>` : ""}
    <div class="panel list-panel">
      <div class="panel-head"><div><h2>Supplier directory</h2><p>Actual records returned by the vendor API</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>VENDOR</th><th>GSTIN</th><th>EMAIL</th><th>PHONE</th><th>LINKED INVOICES</th><th>OPEN BALANCE</th><th>STATUS</th></tr></thead>
      <tbody>${vendorsData.map(v => `<tr>
        <td><span class="vendor-avatar">${escapeHtml(String(v.vendor_name || "?").slice(0,1).toUpperCase())}</span><span class="vendor-name">${escapeHtml(v.vendor_name)}</span></td>
        <td>${escapeHtml(v.gstin || "—")}</td><td>${escapeHtml(v.email || "—")}</td><td>${escapeHtml(v.phone || "—")}</td>
        <td>${Number(v.invoice_count || 0)}</td><td class="amount">${money(v.open_balance)}</td>
        <td>${status(v.is_active ? "Active" : "Inactive", v.is_active ? "green" : "red")}</td>
      </tr>`).join("")}</tbody></table></div>
      ${vendorsData.length ? "" : `<p class="empty-state">No vendors have been created yet. Select “Add vendor” to create the first supplier.</p>`}
    </div>`;
}

function paymentsPage() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const thisMonth = paymentsData.filter(p => String(p.payment_date || "").slice(0,7) === month);
  const monthTotal = thisMonth.reduce((sum,p) => sum + Number(p.amount || 0), 0);
  const paidByInvoice = new Map();
  paymentsData.forEach(p => {
    const key = String(p.invoice_id);
    paidByInvoice.set(key, (paidByInvoice.get(key) || 0) + Number(p.amount || 0));
  });
  const outstanding = invoices
    .filter(i => i.status !== "Paid" && i.status !== "Rejected")
    .reduce((sum,i) => sum + Math.max(0, i.amount - (paidByInvoice.get(String(i.dbId)) || 0)), 0);

  const payableInvoices = invoices.filter(i =>
    i.dbId != null && i.status !== "Paid" && i.status !== "Rejected"
  );

  return `${heading("Payments", "Record accounting entries against existing supplier invoices.",
      button(paymentFormOpen ? "Cancel" : "+ Record payment", paymentFormOpen ? "payment-cancel" : "payment-add"))}
    <div class="demo-notice"><span>i</span><div><b>Accounting records only</b><span>Saving a payment records it in this application. It does not transfer money through a bank.</span></div><span class="notice-tag">DATABASE</span></div>
    <div class="stats-grid">
      ${stat("Payments this month", money(monthTotal), "₹", "green-bg", `${thisMonth.length} recorded`, "From payment register")}
      ${stat("All recorded payments", money(paymentsData.reduce((s,p) => s + Number(p.amount || 0),0)), "₹", "blue-bg", `${paymentsData.length} entries`, "Database total")}
      ${stat("Outstanding invoices", money(outstanding), "!", "amber-bg", "Estimate from loaded invoices", "Review before payment")}
      ${stat("Invoices available", String(payableInvoices.length), "INV", "violet-bg", "Not paid or rejected", "Select an invoice below")}
    </div>
    ${paymentFormOpen ? `
      <div class="panel form-panel">
        <div class="panel-head"><div><h2>Record payment</h2><p>Select an existing invoice and enter the actual payment details.</p></div></div>
        <form id="paymentForm" class="data-form">
          <label>Invoice *
            <select name="invoice_id" required>
              <option value="">Select an invoice</option>
              ${payableInvoices.map(i => {
                const alreadyPaid = paidByInvoice.get(String(i.dbId)) || 0;
                const remaining = Math.max(0, i.amount - alreadyPaid);
                return `<option value="${escapeHtml(i.dbId)}" data-outstanding="${remaining.toFixed(2)}">${escapeHtml(i.invoiceNumber || i.id)} — ${escapeHtml(i.vendor || "Vendor not linked")} — Outstanding ${escapeHtml(money(remaining))}</option>`;
              }).join("")}
            </select>
          </label>
          <label>Payment date *<input name="payment_date" type="date" required value="${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}"></label>
          <label>Payment amount (₹) *<input name="amount" type="number" min="0.01" step="0.01" required inputmode="decimal"></label>
          <label>Payment method *
            <select name="payment_method" required>
              <option>Bank transfer</option><option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>Cheque</option><option>Cash</option><option>Other</option>
            </select>
          </label>
          <label>Reference number<input name="reference_number" maxlength="100"></label>
          <label>Notes<input name="notes" maxlength="1000"></label>
          <div class="form-actions"><button type="button" class="btn" data-action="payment-save">Record payment</button>
          <button type="button" class="btn btn-secondary" data-action="payment-cancel">Cancel</button></div>
          <p class="form-help">Only record a payment that has actually been made. The API checks the remaining invoice balance.</p>
        </form>
        ${payableInvoices.length ? "" : `<p class="empty-state">No eligible invoices are currently loaded. Check the invoice register first.</p>`}
      </div>` : ""}
    <div class="panel list-panel">
      <div class="panel-head"><div><h2>Payment register</h2><p>Actual payment entries returned by the API</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>REFERENCE</th><th>INVOICE</th><th>VENDOR</th><th>DATE</th><th>METHOD</th><th>AMOUNT</th></tr></thead><tbody>
        ${paymentsData.map(p => `<tr>
          <td><b>${escapeHtml(p.reference_number || `PAY-${p.id}`)}</b></td>
          <td>${escapeHtml(p.invoice_number || `Invoice #${p.invoice_id}`)}</td>
          <td>${escapeHtml(p.vendor_name || "Vendor not linked")}</td>
          <td>${escapeHtml(String(p.payment_date || "").slice(0,10) || "—")}</td>
          <td>${escapeHtml(p.payment_method || "—")}</td>
          <td class="amount">${money(p.amount)}</td>
        </tr>`).join("")}
      </tbody></table></div>
      ${paymentsData.length ? "" : `<p class="empty-state">No payment entries exist yet. This register will show payments after they are recorded.</p>`}
    </div>`;
}
function gstPage() {
  const today = new Date();
  const localDate = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const monthStart = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayText = localDate(today);
  const fromDate = gstReportFrom || monthStart;
  const toDate = gstReportTo || todayText;
  const report = gstReportData;

  const total = key => Number(report?.totals?.[key] || 0);
  const reportRows = (report?.invoices || []).map(invoice => `
    <tr>
      <td>${escapeHtml(invoice.invoice_number || "")}</td>
      <td>${escapeHtml(invoice.vendor_name || "")}</td>
      <td>${escapeHtml(String(invoice.invoice_date || "").slice(0, 10))}</td>
      <td>${escapeHtml(invoice.gstin || "—")}</td>
      <td class="amount">${money(Number(invoice.taxable_value || 0))}</td>
      <td class="amount">${money(Number(invoice.cgst || 0))}</td>
      <td class="amount">${money(Number(invoice.sgst || 0))}</td>
      <td class="amount">${money(Number(invoice.igst || 0))}</td>
      <td class="amount">${money(Number(invoice.total_amount || 0))}</td>
    </tr>`).join("");

  return `${heading("GST reports", "Review purchase invoices for a selected reporting period.",
      button("↓ Export GST CSV", "gst-export", true))}
    <div class="panel list-panel" style="margin-bottom:16px">
      <div class="panel-head">
        <div><h2>Reporting period</h2><p>Select a month or enter a custom date range.</p></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:16px">
        <label style="display:flex;flex-direction:column;gap:6px;min-width:170px">
          <span>Month shortcut</span>
          <input id="gstMonth" type="month" value="${escapeHtml(fromDate.slice(0, 7))}">
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;min-width:160px">
          <span>From date</span>
          <input id="gstFromDate" type="date" value="${escapeHtml(fromDate)}">
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;min-width:160px">
          <span>To date</span>
          <input id="gstToDate" type="date" value="${escapeHtml(toDate)}">
        </label>
        <button type="button" class="btn" data-action="gst-filter"
          ${gstReportLoading ? "disabled" : ""}>
          ${gstReportLoading ? "Loading..." : "Apply filter"}
        </button>
      </div>
    </div>

    <div class="demo-notice">
      <span>i</span>
      <div><b>Purchase GST report</b>
      <span>Only invoices with invoice dates inside the selected period are included. Verify the figures before statutory filing.</span></div>
      <span class="notice-tag">DATE FILTERED</span>
    </div>

    ${report ? `
      <div class="stats-grid">
        ${stat("Invoice amount", money(total("invoice_amount")), "₹", "blue-bg",
          `${report.invoice_count} invoices`, `${fromDate} to ${toDate}`)}
        ${stat("Taxable value", money(total("taxable_value")), "₹", "violet-bg",
          `${report.missing_taxable_value_count || 0} missing`,
          "Stored taxable values only")}
        ${stat("CGST", money(total("cgst")), "C", "green-bg",
          "Selected period", "Recorded CGST")}
        ${stat("SGST", money(total("sgst")), "S", "amber-bg",
          "Selected period", "Recorded SGST")}
        ${stat("IGST", money(total("igst")), "I", "blue-bg",
          "Selected period", "Recorded IGST")}
      </div>
      ${(report.missing_taxable_value_count || 0) > 0 ? `
        <div class="demo-notice">
          <span>!</span><div><b>Taxable value missing for some invoices</b>
          <span>${report.missing_taxable_value_count} invoice(s) have no stored taxable value. Their taxable value is shown as zero in this report; verify source invoices before filing.</span></div>
        </div>` : ""}
      <div class="panel list-panel">
        <div class="panel-head"><div>
          <h2>Purchase invoice tax details</h2>
          <p>${escapeHtml(fromDate)} to ${escapeHtml(toDate)} · ${report.invoice_count} record(s)</p>
        </div></div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>INVOICE</th><th>VENDOR</th><th>DATE</th><th>GSTIN</th>
            <th>TAXABLE VALUE</th><th>CGST</th><th>SGST</th><th>IGST</th><th>TOTAL</th>
          </tr></thead>
          <tbody>${reportRows || `<tr><td colspan="9">No invoices found for this period.</td></tr>`}</tbody>
          ${report.invoice_count ? `<tfoot><tr>
            <th colspan="4">TOTAL</th>
            <th class="amount">${money(total("taxable_value"))}</th>
            <th class="amount">${money(total("cgst"))}</th>
            <th class="amount">${money(total("sgst"))}</th>
            <th class="amount">${money(total("igst"))}</th>
            <th class="amount">${money(total("invoice_amount"))}</th>
          </tr></tfoot>` : ""}
        </table></div>
      </div>
    ` : `
      <div class="panel list-panel">
        <div class="panel-head"><div><h2>Purchase tax summary</h2>
          <p>Choose a reporting period and select Apply filter to load database records.</p>
        </div></div>
      </div>
    `}`;
}
function extractionCard() {
  const data = extracted?.data || {};
  const fields = [
    { key: "vendor_name", label: "Vendor name", required: true },
    { key: "gstin", label: "GSTIN" },
    { key: "invoice_number", label: "Invoice number", required: true },
    { key: "invoice_date", label: "Invoice date", type: "date", required: true },
    { key: "total_amount", label: "Total amount (INR)", type: "number", required: true },
    { key: "cgst", label: "CGST", type: "number" },
    { key: "sgst", label: "SGST", type: "number" },
    { key: "igst", label: "IGST", type: "number" },
    { key: "taxable_value", label: "Taxable value after discount (INR)", type: "number" },
    { key: "discount_amount", label: "Discount amount (INR)", type: "number" },
    { key: "other_charges", label: "Other charges (INR)", type: "number" },
    { key: "cess", label: "Cess (INR)", type: "number" }
  ];

  const renderInput = field => {
    let value = data[field.key] ?? "";
    if (field.type === "number") value = String(value).replace(/[^\d.-]/g, "");
    return `<div class="extraction-field review-field">
      <label for="review-${field.key}">${escapeHtml(field.label)}</label>
      <input id="review-${field.key}" data-review-field="${field.key}" type="${field.type || "text"}" value="${escapeHtml(value)}"
        ${field.required ? "required" : ""} ${field.type === "number" ? 'min="0" step="0.01"' : ""} autocomplete="off" />
    </div>`;
  };

  return `<div class="panel extraction-panel">
    <div class="panel-head"><div><h2>âœ¦ AI extraction result â€” Review required</h2><p>${escapeHtml(extracted.filename || "Uploaded invoice")}</p></div>${status("Awaiting verification", "amber")}</div>
    <div class="review-notice">Check every value against the original invoice. AI extraction can be incorrect. Confidence score: ${escapeHtml(data.confidence_score ?? "Not available")}</div>
    <form id="invoiceReviewForm">
      <div class="extraction-grid">${fields.map(renderInput).join("")}</div>
      <p class="extraction-note">Confirm the supplier, invoice number, date, tax amounts and total before approval. Approval here is a demonstration action; it does not post to a live accounting system.</p>
      <div class="review-actions">
        <button type="button" class="review-reject" data-action="reject-extracted">Reject invoice</button>
        <button type="button" class="review-approve" data-action="approve-extracted">âœ“ Approve &amp; Add to Invoice List</button>
      </div>
    </form>
  </div>`;
}

async function runAction(action) {
  if (action === "upload") {
    document.querySelector("#invoiceFile").click();
  } else if (action === "view-invoices") {
    navigate("Invoices");
  } else if (action === "approve-extracted") {
    await saveExtractedInvoice();
  } else if (action === "close-invoice-details") {
    selectedInvoice = null;
    renderPage();
  } else if (action === "reject-extracted") {
    if (!extracted) return;
    extracted = null;
    renderPage();
    toast("Invoice rejected. It was not added to the invoice register.");
  } else if (action === "gst-filter") {
    const fromInput = document.querySelector("#gstFromDate");
    const toInput = document.querySelector("#gstToDate");
    const fromDate = fromInput?.value || "";
    const toDate = toInput?.value || "";

    if (!fromDate || !toDate) {
      toast("Please select both the From Date and To Date.", true);
      return;
    }
    if (fromDate > toDate) {
      toast("From Date cannot be after To Date.", true);
      return;
    }

    gstReportFrom = fromDate;
    gstReportTo = toDate;
    gstReportLoading = true;
    renderPage();

    try {
      const query = new URLSearchParams({ fromDate, toDate });
      const response = await fetch(`/ap-api/api/v1/reports/gst?${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "GST report request failed.");
      gstReportData = data;
      gstReportLoading = false;
      renderPage();
      toast(`GST report loaded: ${data.invoice_count} invoice(s).`);
    } catch (error) {
      gstReportLoading = false;
      renderPage();
      toast(error.message || "Unable to load the GST report.", true);
    }
  } else if (action === "gst-export") {
    if (!gstReportData) {
      toast("Apply a date filter before exporting the GST report.", true);
      return;
    }

    const report = gstReportData;
    const rows = [
      ["GST Purchase Report"],
      ["From Date", report.fromDate, "To Date", report.toDate],
      [],
      ["Invoice", "Vendor", "Invoice Date", "GSTIN", "Taxable Value",
        "CGST", "SGST", "IGST", "Cess", "Other Charges", "Invoice Amount", "Status"],
      ...report.invoices.map(invoice => [
        invoice.invoice_number,
        invoice.vendor_name,
        String(invoice.invoice_date || "").slice(0, 10),
        invoice.gstin || "",
        invoice.taxable_value ?? "",
        invoice.cgst,
        invoice.sgst,
        invoice.igst,
        invoice.cess,
        invoice.other_charges,
        invoice.total_amount,
        invoice.status
      ]),
      [],
      ["TOTALS", "", "", "",
        report.totals.taxable_value,
        report.totals.cgst,
        report.totals.sgst,
        report.totals.igst,
        report.totals.cess,
        report.totals.other_charges,
        report.totals.invoice_amount,
        ""],
      ["Invoices missing taxable value", report.missing_taxable_value_count]
    ];

    const csv = rows.map(row => row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(",")).join("\r\n");

    const blobUrl = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })
    );
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `hrs-tech-gst-report-${report.fromDate}-to-${report.toDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    toast("Date-filtered GST report exported.");
  } else if (action === "vendor-add") {
    vendorFormOpen = true;
    renderPage();
  } else if (action === "vendor-cancel") {
    vendorFormOpen = false;
    renderPage();
  } else if (action === "vendor-save") {
    const form = document.querySelector("#vendorForm");
    if (!form || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    values.vendor_name = String(values.vendor_name || "").trim();
    values.gstin = String(values.gstin || "").trim().toUpperCase();
    values.email = String(values.email || "").trim();
    values.phone = String(values.phone || "").trim();

    if (values.gstin && !/^[0-9A-Z]{15}$/.test(values.gstin)) {
      toast("GSTIN must contain exactly 15 letters/numbers.", true);
      return;
    }

    try {
      const response = await fetch("/ap-api/api/v1/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save vendor.");
      vendorFormOpen = false;
      vendorsLoaded = false;
      await loadVendorsFromApi();
      toast("Vendor saved to the database.");
    } catch (error) {
      toast(error.message || "Could not save vendor.", true);
    }
  } else if (action === "payment-add") {
    if (!invoicesLoaded) {
      toast("Invoices are still loading. Please retry shortly.", true);
      return;
    }
    paymentFormOpen = true;
    renderPage();
  } else if (action === "payment-cancel") {
    paymentFormOpen = false;
    renderPage();
  } else if (action === "payment-save") {
    const form = document.querySelector("#paymentForm");
    if (!form || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    values.invoice_id = String(values.invoice_id || "").trim();
    values.payment_date = String(values.payment_date || "").trim();
    values.amount = Number(values.amount);
    values.payment_method = String(values.payment_method || "Bank transfer").trim();
    values.reference_number = String(values.reference_number || "").trim();
    values.notes = String(values.notes || "").trim();

    if (!values.invoice_id || !Number.isFinite(values.amount) || values.amount <= 0) {
      toast("Select an invoice and enter a payment amount greater than zero.", true);
      return;
    }

    const selectedInvoice = invoices.find(i => String(i.dbId) === values.invoice_id);
    if (!selectedInvoice) {
      toast("The selected invoice could not be found. Refresh the invoice list.", true);
      return;
    }

    const alreadyPaid = paymentsData
      .filter(p => String(p.invoice_id) === values.invoice_id)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const remaining = Math.round((selectedInvoice.amount - alreadyPaid) * 100) / 100;
    if (values.amount > remaining + 0.001) {
      toast(`Amount exceeds the estimated outstanding balance of ${money(Math.max(0, remaining))}.`, true);
      return;
    }

    if (!window.confirm(`Record ${money(values.amount)} against invoice ${selectedInvoice.invoiceNumber || selectedInvoice.id}?\n\nThis records an accounting entry only; it does not transfer money.`)) {
      return;
    }

    try {
      const response = await fetch("/ap-api/api/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not record payment.");

      paymentFormOpen = false;
      paymentsLoaded = false;
      const paymentsResponse = await fetch("/ap-api/api/v1/payments");
      const paymentsBody = await paymentsResponse.json().catch(() => ({}));
      if (!paymentsResponse.ok) throw new Error(paymentsBody.error || "Payment saved, but the register could not be refreshed.");
      paymentsData = Array.isArray(paymentsBody.payments) ? paymentsBody.payments : [];
      paymentsLoaded = true;

      const invoicesResponse = await fetch("/ap-api/api/v1/invoices");
      const invoicesBody = await invoicesResponse.json().catch(() => ({}));
      if (invoicesResponse.ok) {
        invoices = (invoicesBody.invoices || []).map(apiInvoiceToUi);
        invoicesLoaded = true;
      }

      renderPage();
      toast("Payment entry recorded successfully.");
    } catch (error) {
      toast(error.message || "Could not record payment.", true);
    }
  }
}

async function saveExtractedInvoice() {
  const form = document.querySelector("#invoiceReviewForm");

  if (!form || !extracted) {
    toast("Please upload and extract an invoice first.", true);
    return;
  }
  if (!form.reportValidity()) return;
  if (!invoicesLoaded) {
    toast("The invoice database is not available. Please retry after it reconnects.", true);
    return;
  }

  const get = key => form.querySelector(`[data-review-field="${key}"]`)?.value?.trim() ?? "";
  const invoiceNumber = get("invoice_number");
  const vendorName = get("vendor_name");
  const gstin = get("gstin");
  const invoiceDate = get("invoice_date");
  const totalAmount = Number(get("total_amount"));
  const cgst = Number(get("cgst") || 0);
  const sgst = Number(get("sgst") || 0);
  const igst = Number(get("igst") || 0);
  const optionalNumber = key => get(key) === "" ? null : Number(get(key));

  if (!invoiceNumber || !vendorName || !invoiceDate || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    toast("Check vendor, invoice number, date and total amount.", true);
    return;
  }

  if ([cgst, sgst, igst].some(value => !Number.isFinite(value) || value < 0)) {
    toast("Tax amounts must be valid non-negative numbers.", true);
    return;
  }

  if (invoices.some(invoice => String(invoice.invoiceNumber || invoice.id).toLowerCase() === invoiceNumber.toLowerCase())) {
    toast("That invoice number is already in the invoice register.", true);
    return;
  }

  const optionalFields = ["taxable_value", "discount_amount", "other_charges", "cess"];
  for (const key of optionalFields) {
    const value = optionalNumber(key);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast(`${key.replaceAll("_", " ")} must be a valid non-negative number.`, true);
      return;
    }
  }

  const saveButton = form.querySelector('[data-action="approve-extracted"]');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  try {
    const response = await fetch("/ap-api/api/v1/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_number: invoiceNumber,
        vendor_name: vendorName,
        gstin,
        invoice_date: invoiceDate,
        total_amount: totalAmount,
        cgst,
        sgst,
        igst,
        taxable_value: optionalNumber("taxable_value"),
        discount_amount: Number(get("discount_amount") || 0),
        other_charges: Number(get("other_charges") || 0),
        cess: Number(get("cess") || 0),
        source: "AI extraction"
      })
    });

    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Save failed (${response.status})`);
    if (!body.invoice) throw new Error("The API did not return the saved invoice record.");

    invoices.unshift(apiInvoiceToUi(body.invoice));
    selectedInvoice = null;
    extracted = null;
    currentPage = "Invoices";
    renderPage();
    toast("Invoice saved to PostgreSQL with Pending approval status.");
  } catch (error) {
    toast(`Could not save invoice: ${error.message}`, true);
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "âœ“ Approve & Add to Invoice List";
    }
  }
}

async function uploadInvoice(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = "";

  if (file.size > 15 * 1024 * 1024) {
    toast("File exceeds the 15 MB limit.", true);
    return;
  }

  const extension = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "jpg", "jpeg", "png"].includes(extension)) {
    toast("Choose a PDF, JPG, JPEG or PNG file.", true);
    return;
  }

  extracted = null;
  const content = document.querySelector("#content");
  const progress = document.createElement("div");
  progress.className = "upload-progress";
  progress.innerHTML = `<div class="spinner"></div><div><b>AI is processing your invoice</b><p>${escapeHtml(file.name)} Â· OCR and field extraction in progress</p></div>`;
  content.prepend(progress);
  toast("Uploading invoice to the extraction service...");

  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/extract-api/api/v1/extract", { method: "POST", body: form });
    const body = await response.json();

    if (!response.ok) throw new Error(body.detail || body.error || `Extraction failed (${response.status})`);
    extracted = body;
    toast("Invoice extraction completed. Please review all fields.");
    renderPage();
    document.querySelector(".extraction-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    progress.remove();
    toast(`Extraction failed: ${error.message}. Check that port 8098 is healthy.`, true);
  }
}

function toast(message, error = false) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = message;
  element.className = `toast show ${error ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 5000);
}

shell();
loadInvoicesFromApi();

