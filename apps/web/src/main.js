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

const demoInvoices = [
  { id: "INV-2026-1042", vendor: "Apex Office Solutions", date: "26 Oct 2026", amount: 47200, status: "Pending approval", cls: "amber", gst: "29AABCA1234F1Z5" },
  { id: "INV-2026-1041", vendor: "Bluewave Technologies", date: "25 Oct 2026", amount: 82600, status: "Approved", cls: "green", gst: "29AACCB5678K1Z2" },
  { id: "INV-2026-1040", vendor: "Prime Industrial Supplies", date: "24 Oct 2026", amount: 18500, status: "Overdue", cls: "red", gst: "29AABCP2345D1Z8" },
  { id: "INV-2026-1039", vendor: "Vertex Business Services", date: "23 Oct 2026", amount: 35400, status: "Paid", cls: "blue", gst: "29AACCV3456G1Z4" },
  { id: "INV-2026-1038", vendor: "Nova Packaging Co.", date: "22 Oct 2026", amount: 12600, status: "Processing", cls: "purple", gst: "29AAACN7890M1Z1" }
];

const vendors = [
  ["Apex Office Solutions", "29AABCA1234F1Z5", "Office supplies", "\u20B91,24,500", "Active"],
  ["Bluewave Technologies", "29AACCB5678K1Z2", "IT & software", "\u20B982,600", "Active"],
  ["Prime Industrial Supplies", "29AABCP2345D1Z8", "Industrial", "\u20B956,300", "Active"],
  ["Vertex Business Services", "29AACCV3456G1Z4", "Professional services", "\u20B90", "Active"],
  ["Nova Packaging Co.", "29AAACN7890M1Z1", "Packaging", "\u20B912,600", "Active"]
];

let currentPage = "Dashboard";
let invoices = [];
let invoicesLoaded = false;
let extracted = null;

const money = n => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(n);

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function apiInvoiceToUi(row) {
  const invoiceDate = row.invoice_date ? String(row.invoice_date).slice(0, 10) : "";
  const dateLabel = invoiceDate
    ? new Date(`${invoiceDate}T00:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric"
      })
    : "—";

  const statusClasses = {
    "Pending approval": "amber",
    "Approved": "green",
    "Rejected": "red",
    "Overdue": "red",
    "Paid": "blue",
    "Processing": "purple"
  };

  return {
    dbId: row.id,
    id: row.invoice_number,
    invoiceNumber: row.invoice_number,
    vendor: row.vendor_name,
    date: dateLabel,
    invoiceDate,
    amount: Number(row.total_amount) || 0,
    status: row.status,
    cls: statusClasses[row.status] || "amber",
    gst: row.gstin || "",
    cgst: Number(row.cgst) || 0,
    sgst: Number(row.sgst) || 0,
    igst: Number(row.igst) || 0,
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
        <div><div class="brand-name">HRS <span>TECH</span></div><div class="brand-sub">INTELLIGENT FINANCE</div></div>
      </div>
      <div class="workspace-label">WORKSPACE</div>
      <nav id="navigation">
        ${navItem("Dashboard", "dashboard")}
        ${navItem("Invoices", "invoices", "5")}
        ${navItem("Vendors", "vendors")}
        ${navItem("Payments", "payments")}
        ${navItem("GST Reports", "gst")}
      </nav>
      <div class="sidebar-bottom">
        <div class="ai-card"><div class="ai-icon">\u2726</div><div><b>AI Assistant</b><p>Invoice intelligence is ready.</p><span class="online-dot"></span> Extraction service</div></div>
        <div class="profile"><div class="avatar">HR</div><div class="profile-info"><b>HRS Administrator</b><small>Finance Admin \u00B7 Demo</small></div><span>Admin</span></div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="crumb">Workspace <span>/</span> <b id="crumb">Dashboard</b></div>
        <div class="top-actions"><span class="environment"><i></i> DEMO ENVIRONMENT</span><button class="icon-btn" title="Notifications">\u2667<i class="notify-dot"></i></button><div class="avatar small">HR</div></div>
      </header>
      <section class="content" id="content"></section>
      <footer>(c) 2026 HRS TECH AI Solutions <span>AI-powered accounts payable \u00B7 Demonstration environment</span></footer>
    </main>
    <input type="file" id="invoiceFile" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" hidden />
    <div id="toast" class="toast" role="status"></div>
  `;

  document.querySelector("#navigation").addEventListener("click", e => {
    const item = e.target.closest("[data-page]");
    if (item) navigate(item.dataset.page);
  });
  document.querySelector("#invoiceFile").addEventListener("change", uploadInvoice);
  navigate("Dashboard");
}

function navItem(label, icon, count = "") {
  return `<button class="nav-item ${label === "Dashboard" ? "active" : ""}" data-page="${label}">
    <span class="nav-icon">${icons[icon]}</span><span>${label}</span>
    ${count ? `<span class="nav-count">${count}</span>` : ""}
  </button>`;
}

function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(el =>
    el.classList.toggle("active", el.dataset.page === page)
  );
  document.querySelector("#crumb").textContent = page;
  renderPage();
}

function heading(title, description, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">HRS TECH / FINANCE</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function button(label, action, secondary = false) {
  return `<button class="btn ${secondary ? "btn-secondary" : ""}" data-action="${action}">${label}</button>`;
}

function status(text, cls) {
  return `<span class="status ${cls}"><i></i>${escapeHtml(text)}</span>`;
}

function invoiceTable(items = invoices) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>INVOICE</th><th>VENDOR</th><th>INVOICE DATE</th><th>AMOUNT</th><th>STATUS</th><th></th>
    </tr></thead><tbody>${items.map((x, i) => `<tr>
      <td><b class="invoice-id">${escapeHtml(x.id)}</b><small>Purchase invoice</small></td>
      <td><span class="vendor-avatar">${escapeHtml(x.vendor.slice(0,1))}</span><span class="vendor-name">${escapeHtml(x.vendor)}</span></td>
      <td>${escapeHtml(x.date)}</td><td class="amount">${money(x.amount)}</td>
      <td>${status(x.status, x.cls)}</td>
      <td><button class="dots" data-invoice="${i}" title="View invoice">\u00B7\u00B7\u00B7</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function renderPage() {
  const content = document.querySelector("#content");
  if (currentPage === "Dashboard") content.innerHTML = dashboard();
  else if (currentPage === "Invoices") content.innerHTML = invoicesPage();
  else if (currentPage === "Vendors") content.innerHTML = vendorsPage();
  else if (currentPage === "Payments") content.innerHTML = paymentsPage();
  else if (currentPage === "GST Reports") content.innerHTML = gstPage();
  content.querySelectorAll("[data-action]").forEach(el =>
    el.addEventListener("click", () => runAction(el.dataset.action))
  );
  const search = content.querySelector("#invoiceSearch");
  if (search) search.addEventListener("input", () => {
    const q = search.value.toLowerCase();
    const filtered = invoices.filter(x => `${x.id} ${x.vendor} ${x.status}`.toLowerCase().includes(q));
    content.querySelector("#invoiceRows").innerHTML = invoiceTable(filtered);
  });
  const filter = content.querySelector("#statusFilter");
  if (filter) filter.addEventListener("change", () => {
    const filtered = filter.value === "All" ? invoices : invoices.filter(x => x.status === filter.value);
    content.querySelector("#invoiceRows").innerHTML = invoiceTable(filtered);
  });
}

function dashboard() {
  const total = invoices.reduce((sum, x) => sum + x.amount, 0);
  return `${heading("Good afternoon - here's what's happening with your accounts payable today.",
    button("+ Upload invoice", "upload"))}
    <div class="demo-notice"><span>i</span><div><b>Demo workspace</b><span>Illustrative figures and sample records. Upload a test invoice to try real AI extraction.</span></div><span class="notice-tag">SANDBOX</span></div>
    <div class="section-heading"><div><h2>Financial overview</h2><p>Your AP performance at a glance</p></div><span class="date-chip">Date: &nbsp; October 2026</span></div>
    <div class="stats-grid">
      ${stat("Total invoices", invoices.length.toString(), "INV", "blue-bg", "Sample Sample register", "Based on demo records")}
      ${stat("Total invoice value", money(total), "\u20B9", "violet-bg", "October sample", "Illustrative total")}
      ${stat("Awaiting approval", invoices.filter(x => x.status === "Pending approval").length.toString(), "Pending", "amber-bg", "Needs attention", "Review pending invoices")}
      ${stat("Overdue payables", money(invoices.filter(x => x.status === "Overdue").reduce((s,x)=>s+x.amount,0)), "!", "red-bg", "Action required", "Illustrative overdue value")}
    </div>
    <div class="dashboard-grid">
      <section class="panel invoice-panel"><div class="panel-head"><div><h2>Recent invoices</h2><p>Latest activity across your AP register</p></div><button class="text-btn" data-action="view-invoices">View all invoices \u2192</button></div>${invoiceTable(invoices.slice(0,5))}<div class="table-foot"><span>Showing ${invoices.length} demo records</span><span>Updated just now</span></div></section>
      <section class="panel workflow-panel"><div class="panel-head"><div><h2>Invoice workflow</h2><p>Processing overview</p></div><span class="spark">\u2726 AI</span></div>
      ${workflowRow("Received", 5, 100, "wf-blue")}
      ${workflowRow("Processing", invoices.filter(x=>x.status==="Processing").length, 35, "wf-purple")}
      ${workflowRow("Pending approval", invoices.filter(x=>x.status==="Pending approval").length, 55, "wf-amber")}
      ${workflowRow("Approved", invoices.filter(x=>x.status==="Approved").length, 75, "wf-green")}
      <div class="ai-promo"><div class="ai-promo-icon">\u2726</div><div><b>Smart invoice capture</b><p>Extract supplier and tax details from a PDF or image using your running OCR service.</p><button data-action="upload" class="text-btn">Try invoice extraction \u2192</button></div></div>
      </section>
    </div>
    ${extracted ? extractionCard() : ""}`;
}

function stat(title, value, icon, bg, label, sub) {
  return `<div class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon ${bg}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-bottom"><span>${label}</span><small>${sub}</small></div></div>`;
}

function workflowRow(label, count, width, cls) {
  return `<div class="workflow-row"><div><span>${label}</span><b>${count}</b></div><div class="progress"><i class="${cls}" style="width:${width}%"></i></div></div>`;
}

function invoicesPage() {
  return `${heading("Invoices", "Capture, review and manage your supplier invoices.", button("+ Upload invoice", "upload"))}
    <div class="demo-notice"><span>i</span><div><b>Live invoice register</b><span>Invoices are loaded from the AP PostgreSQL database.</span></div><span class="notice-tag">SANDBOX</span></div>
    <div class="panel list-panel"><div class="list-toolbar"><div class="search-box">Search: <input id="invoiceSearch" placeholder="Search invoice or vendor..." /></div><select id="statusFilter" class="select"><option>All</option><option>Pending approval</option><option>Approved</option><option>Overdue</option><option>Paid</option><option>Processing</option></select></div><div id="invoiceRows">${invoiceTable()}</div><div class="table-foot"><span>${invoices.length} records in database</span><span>Upload a test invoice to try OCR</span></div></div>
    ${extracted ? extractionCard() : ""}`;
}

function vendorsPage() {
  return `${heading("Vendors", "Manage supplier information and payable relationships.", button("+ Add vendor", "vendor-add"))}
  <div class="demo-notice"><span>i</span><div><b>Sample vendor data</b><span>These illustrative suppliers are not stored in a database.</span></div><span class="notice-tag">SANDBOX</span></div>
  <div class="stats-grid compact-stats">${stat("Total vendors","5","V","blue-bg","Demo records","Supplier directory")}${stat("Active vendors","5","OK","green-bg","All sample vendors","Illustrative status")}${stat("Open balances","\u20B92,76,000","\u20B9","amber-bg","Sample balance","Not real liabilities")}</div>
  <div class="panel list-panel"><div class="panel-head"><div><h2>Supplier directory</h2><p>Demo supplier records</p></div></div><div class="table-wrap"><table><thead><tr><th>VENDOR</th><th>GSTIN</th><th>CATEGORY</th><th>OPEN BALANCE</th><th>STATUS</th></tr></thead><tbody>${vendors.map(v=>`<tr><td><span class="vendor-avatar">${escapeHtml(v[0][0])}</span><span class="vendor-name">${escapeHtml(v[0])}</span></td><td>${escapeHtml(v[1])}</td><td>${escapeHtml(v[2])}</td><td class="amount">${v[3]}</td><td>${status(v[4],"green")}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function paymentsPage() {
  return `${heading("Payments", "Track supplier settlements and upcoming payment obligations.", button("+ Record payment", "payment-add"))}
  <div class="demo-notice"><span>i</span><div><b>Payment demo</b><span>No bank connection or actual payment is initiated by this demonstration.</span></div><span class="notice-tag">SANDBOX</span></div>
  <div class="stats-grid">${stat("Payments this month","\u20B935,400","\u20B9","green-bg","Sample paid amount","Illustrative only")}${stat("Scheduled","\u20B91,29,800","Pending","blue-bg","Demo schedule","Not submitted to bank")}${stat("Awaiting payment","\u20B965,800","!","amber-bg","Sample outstanding","Needs review")}${stat("Overdue","\u20B918,500","Overdue","red-bg","Sample obligation","Illustrative only")}</div>
  <div class="panel list-panel"><div class="panel-head"><div><h2>Payment register</h2><p>Example payment activity</p></div></div><div class="table-wrap"><table><thead><tr><th>REFERENCE</th><th>VENDOR</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody><tr><td><b>PAY-DEMO-004</b></td><td>Vertex Business Services</td><td>23 Oct 2026</td><td class="amount">\u20B935,400</td><td>${status("Paid","green")}</td></tr><tr><td><b>PAY-DEMO-003</b></td><td>Bluewave Technologies</td><td>28 Oct 2026</td><td class="amount">\u20B982,600</td><td>${status("Scheduled","blue")}</td></tr><tr><td><b>PAY-DEMO-002</b></td><td>Prime Industrial Supplies</td><td>20 Oct 2026</td><td class="amount">\u20B918,500</td><td>${status("Overdue","red")}</td></tr></tbody></table></div></div>`;
}

function gstPage() {
  return `${heading("GST reports", "Review illustrative purchase-tax summaries.", button("\u2193 Export CSV", "export"))}
  <div class="demo-notice"><span>i</span><div><b>Illustrative tax summary</b><span>Not a statutory return. Verify invoice tax treatment before accounting or filing.</span></div><span class="notice-tag">SANDBOX</span></div>
  <div class="stats-grid">${stat("Taxable value","\u20B91,70,000","\u20B9","blue-bg","Example only","Sample taxable base")}${stat("CGST","\u20B915,300","CGST","violet-bg","9% illustration","Not validated")}${stat("SGST","\u20B915,300","SGST","green-bg","9% illustration","Not validated")}${stat("IGST","\u20B90","\u20B9","amber-bg","Sample records","Not validated")}</div>
  <div class="panel list-panel"><div class="panel-head"><div><h2>Purchase tax summary</h2><p>Demo reporting period \u00B7 October 2026</p></div></div><div class="table-wrap"><table><thead><tr><th>TAX CATEGORY</th><th>TAXABLE VALUE</th><th>TAX RATE</th><th>TAX AMOUNT</th></tr></thead><tbody><tr><td>CGST</td><td>\u20B91,70,000</td><td>9% (illustrative)</td><td class="amount">\u20B915,300</td></tr><tr><td>SGST</td><td>\u20B91,70,000</td><td>9% (illustrative)</td><td class="amount">\u20B915,300</td></tr><tr><td>IGST</td><td>\u20B90</td><td>\u2014</td><td class="amount">\u20B90</td></tr></tbody></table></div></div>`;
}

function extractionCard() {
  const d = extracted?.data || {};
  const fields = [
    { key: "vendor_name", label: "Vendor name", required: true },
    { key: "gstin", label: "GSTIN" },
    { key: "invoice_number", label: "Invoice number", required: true },
    { key: "invoice_date", label: "Invoice date", type: "date", required: true },
    { key: "total_amount", label: "Total amount (INR)", type: "number", required: true },
    { key: "cgst", label: "CGST", type: "number" },
    { key: "sgst", label: "SGST", type: "number" },
    { key: "igst", label: "IGST", type: "number" }
  ];

  const input = field => {
    let value = d[field.key] ?? "";
    if (field.type === "number") {
      value = String(value).replace(/[^\d.-]/g, "");
    }
    const type = field.type || "text";
    return `<div class="extraction-field review-field">
      <label for="review-${field.key}">${escapeHtml(field.label)}</label>
      <input id="review-${field.key}" data-review-field="${field.key}"
        type="${type}" value="${escapeHtml(value)}"
        ${field.required ? "required" : ""}
        ${field.type === "number" ? 'min="0" step="0.01"' : ""}
        autocomplete="off" />
    </div>`;
  };

  return `<div class="panel extraction-panel">
    <div class="panel-head">
      <div>
        <h2>\u2726 AI extraction result \u2014 Review required</h2>
        <p>${escapeHtml(extracted.filename || "Uploaded invoice")}</p>
      </div>
      ${status("Awaiting verification", "amber")}
    </div>
    <div class="review-notice">
      Check every value against the original invoice. AI extraction can be incorrect.
      Confidence score: ${escapeHtml(d.confidence_score ?? "Not available")}
    </div>
    <form id="invoiceReviewForm">
      <div class="extraction-grid">${fields.map(input).join("")}</div>
      <p class="extraction-note">
        Confirm the supplier, invoice number, date, tax amounts and total before approval.
        Approval here is a demonstration action; it does not post to a live accounting system.
      </p>
      <div class="review-actions">
        <button type="button" class="review-reject" data-action="reject-extracted">Reject invoice</button>
        <button type="button" class="review-approve" data-action="approve-extracted">&#10003; Approve &amp; Add to Invoice List</button>
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
  } else if (action === "reject-extracted") {
    const form = document.querySelector("#invoiceReviewForm");
    if (!form || !form.reportValidity()) return;

    const get = key => form.querySelector(`[data-review-field="${key}"]`).value.trim();
    const vendor = get("vendor_name");
    const id = get("invoice_number");
    const date = get("invoice_date");
    const amount = Number(get("total_amount"));

    if (!vendor || !id || !date || !Number.isFinite(amount) || amount <= 0) {
      toast("Check vendor, invoice number, date and total amount.", true);
      return;
    }

    const existing = invoices.find(x => String(x.id).toLowerCase() === id.toLowerCase());
    if (existing && existing.status !== "Pending approval") {
      toast("This invoice number already exists in the register. Check for a duplicate.", true);
      return;
    }

    const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric"
    });

    const record = {
      id,
      vendor,
      date: dateLabel,
      amount,
      status: "Approved",
      cls: "green",
      gst: get("gstin"),
      cgst: Number(get("cgst") || 0),
      sgst: Number(get("sgst") || 0),
      igst: Number(get("igst") || 0),
      source: "AI extraction",
      approvedAt: new Date().toISOString()
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      invoices.unshift(record);
    }

    try {
      localStorage.setItem("hrs-ai-ap-demo-invoices", JSON.stringify(invoices));
    } catch (error) {
      toast("Could not save this invoice in browser storage.", true);
      return;
    }

    extracted = null;
    navigate("Invoices");
    toast("Invoice approved and added to the demo register.");
  } else if (action === "reject-extracted") {
    if (!extracted) return;
    extracted = null;
    renderPage();
    toast("Invoice rejected. It was not added to the register.");
  } else if (action === "export") {
    const rows = [["Invoice","Vendor","Date","Amount","Status"], ...invoices.map(x=>[x.id,x.vendor,x.date,x.amount,x.status])];
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download = "hrs-tech-demo-invoice-register.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Demo invoice register exported.");
  } else if (action === "vendor-add") {
    toast("Vendor creation will be enabled when the database module is connected.");
  } else if (action === "payment-add") {
    toast("Payment recording will be enabled when the accounting API is connected.");
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

  const get = key =>
    form.querySelector(`[data-review-field="${key}"]`)?.value?.trim() ?? "";

  const invoiceNumber = get("invoice_number");
  const vendorName = get("vendor_name");
  const gstin = get("gstin");
  const invoiceDate = get("invoice_date");
  const totalAmount = Number(get("total_amount"));
  const cgst = Number(get("cgst") || 0);
  const sgst = Number(get("sgst") || 0);
  const igst = Number(get("igst") || 0);

  if (!invoiceNumber || !vendorName || !invoiceDate ||
      !Number.isFinite(totalAmount) || totalAmount <= 0) {
    toast("Check vendor, invoice number, date and total amount.", true);
    return;
  }

  if (invoices.some(invoice =>
    String(invoice.invoiceNumber || invoice.id).toLowerCase() === invoiceNumber.toLowerCase()
  )) {
    toast("That invoice number is already in the invoice register.", true);
    return;
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
        source: "AI extraction"
      })
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || `Save failed (${response.status})`);
    }

    invoices.unshift(apiInvoiceToUi(body.invoice));
    extracted = null;
    currentPage = "Invoices";
    shell();
    renderPage();
    toast("Invoice saved to PostgreSQL with Pending approval status.");
  } catch (error) {
    toast(`Could not save invoice: ${error.message}`, true);
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "✓ Approve & Add to Invoice List";
    }
  }
}
async function uploadInvoice(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = "";
  if (file.size > 15 * 1024 * 1024) {
    toast("File exceeds the 15 MB limit.", true); return;
  }
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf","jpg","jpeg","png"].includes(ext)) {
    toast("Choose a PDF, JPG, JPEG or PNG file.", true); return;
  }

  extracted = null;
  const content = document.querySelector("#content");
  const progress = document.createElement("div");
  progress.className = "upload-progress";
  progress.innerHTML = `<div class="spinner"></div><div><b>AI is processing your invoice</b><p>${escapeHtml(file.name)} \u00B7 OCR and field extraction in progress</p></div>`;
  content.prepend(progress);
  toast("Uploading invoice to the extraction service...");

  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/extract-api/api/v1/extract", {
      method: "POST", body: form
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.detail || `Extraction failed (${response.status})`);
    }
    extracted = body;
    toast("Invoice extraction completed successfully.");
    renderPage();
    document.querySelector(".extraction-panel")?.scrollIntoView({behavior:"smooth",block:"center"});
  } catch (error) {
    progress.remove();
    toast(`Extraction failed: ${error.message}. Check that port 8098 is healthy.`, true);
  }
}

let toastTimer;
function toast(message, error = false) {
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${error ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 5000);
}

shell();
loadInvoicesFromApi();


