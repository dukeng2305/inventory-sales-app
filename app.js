const STORAGE_KEY = "inventory-sales-offline-v1";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const state = loadState();
let reportRange = "day";
let editingSaleId = "";

const el = {
  todayRevenue: document.querySelector("#todayRevenue"),
  todayOrders: document.querySelector("#todayOrders"),
  todayItems: document.querySelector("#todayItems"),
  saleForm: document.querySelector("#saleForm"),
  orderItems: document.querySelector("#orderItems"),
  addOrderItem: document.querySelector("#addOrderItem"),
  salePayment: document.querySelector("#salePayment"),
  saleSubmit: document.querySelector("#saleSubmit"),
  cancelSaleEdit: document.querySelector("#cancelSaleEdit"),
  salePreview: document.querySelector("#salePreview"),
  reportDate: document.querySelector("#reportDate"),
  reportLabel: document.querySelector("#reportLabel"),
  reportRevenue: document.querySelector("#reportRevenue"),
  reportOrders: document.querySelector("#reportOrders"),
  cashRevenue: document.querySelector("#cashRevenue"),
  transferRevenue: document.querySelector("#transferRevenue"),
  productReportFilter: document.querySelector("#productReportFilter"),
  topProducts: document.querySelector("#topProducts"),
  saleHistory: document.querySelector("#saleHistory"),
  exportBtn: document.querySelector("#exportBtn"),
};

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", () => {
    reportRange = button.dataset.range;
    document.querySelectorAll(".range-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderReports();
  });
});

el.reportDate.value = formatDateInput(new Date());
el.reportDate.addEventListener("change", renderReports);
el.productReportFilter.addEventListener("input", renderReports);

el.addOrderItem.addEventListener("click", () => {
  addOrderItemRow();
  updateSalePreview();
});

el.cancelSaleEdit.addEventListener("click", resetSaleForm);

el.saleForm.addEventListener("input", (event) => {
  if (event.target.matches("[data-field]")) {
    updateSalePreview();
  }
});

el.saleForm.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-item]");
  if (!removeButton) return;

  const rows = [...el.orderItems.querySelectorAll(".order-row")];
  if (rows.length === 1) {
    rows[0].querySelector('[data-field="name"]').value = "";
    rows[0].querySelector('[data-field="price"]').value = "";
    rows[0].querySelector('[data-field="qty"]').value = "1";
  } else {
    removeButton.closest(".order-row").remove();
  }
  updateSalePreview();
});

el.saleForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const items = collectOrderItems();
  const paymentMethod = el.salePayment.value;

  if (items.length === 0) {
    showSaleMessage("Bạn cần nhập ít nhất một sản phẩm trong đơn.");
    return;
  }

  const total = sumOrderItems(items);
  const editingSale = state.sales.find((sale) => sale.id === editingSaleId);
  const saleData = {
    items,
    productName: saleTitle(items),
    qty: sumOrderQty(items),
    unitPrice: items.length === 1 ? items[0].price : 0,
    total,
    paymentMethod,
  };

  if (editingSale) {
    Object.assign(editingSale, saleData);
    saveState();
    resetSaleForm();
    render();
    showSaleMessage(`Đã cập nhật đơn: ${formatMoney(total)} · ${paymentMethodLabel(paymentMethod)}.`);
    return;
  }

  state.sales.unshift({
    id: crypto.randomUUID(),
    ...saleData,
    createdAt: new Date().toISOString(),
  });

  saveState();
  resetSaleForm();
  render();
  showSaleMessage(`Đã lưu đơn: ${formatMoney(total)} · ${paymentMethodLabel(paymentMethod)}.`);
});

el.exportBtn.addEventListener("click", () => {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `du-lieu-ban-hang-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    return {
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
    };
  }

  return { sales: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-button").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((item) => {
    item.classList.toggle("active", item.id === tabName);
  });
}

function resetSaleForm() {
  editingSaleId = "";
  el.salePayment.value = "cash";
  el.saleSubmit.textContent = "Lưu đơn bán";
  el.cancelSaleEdit.classList.add("hidden");
  renderOrderItems([{ name: "", price: "", qty: 1 }]);
  updateSalePreview();
}

function render() {
  renderSummary();
  renderReports();
  renderHistory();
}

function renderSummary() {
  const todaySales = salesInRange("day");
  el.todayRevenue.textContent = formatMoney(sumRevenue(todaySales));
  el.todayOrders.textContent = todaySales.length;
  el.todayItems.textContent = todaySales.reduce((total, sale) => total + sumOrderQty(saleItems(sale)), 0);
}

function renderOrderItems(items) {
  el.orderItems.innerHTML = items
    .map((item, index) => orderItemTemplate(item, index))
    .join("");
}

function addOrderItemRow(item = { name: "", price: "", qty: 1 }) {
  el.orderItems.insertAdjacentHTML("beforeend", orderItemTemplate(item, el.orderItems.children.length));
  const lastNameInput = el.orderItems.lastElementChild.querySelector('[data-field="name"]');
  lastNameInput.focus();
}

function orderItemTemplate(item, index) {
  return `
    <div class="order-row">
      <label>
        Sản phẩm
        <input data-field="name" type="text" placeholder="Tên sản phẩm" value="${escapeAttribute(item.name || "")}" required />
      </label>
      <label>
        Giá
        <input data-field="price" type="number" min="0" step="1000" placeholder="120000" value="${item.price || ""}" required />
      </label>
      <label>
        Số lượng
        <input data-field="qty" type="number" min="1" step="1" value="${item.qty || 1}" required />
      </label>
      <button class="danger-button remove-item-button" type="button" data-remove-item="${index}">Xóa</button>
    </div>
  `;
}

function collectOrderItems() {
  return [...el.orderItems.querySelectorAll(".order-row")]
    .map((row) => {
      const name = row.querySelector('[data-field="name"]').value.trim();
      const price = Number(row.querySelector('[data-field="price"]').value);
      const qty = Number(row.querySelector('[data-field="qty"]').value);
      return { name, price, qty };
    })
    .filter((item) => item.name && item.price >= 0 && item.qty > 0);
}

function updateSalePreview() {
  const items = collectOrderItems();
  if (items.length === 0) {
    showSaleMessage("Nhập sản phẩm để tạo đơn.");
    return;
  }

  showSaleMessage(`Tạm tính: ${formatMoney(sumOrderItems(items))} · ${items.length} sản phẩm.`);
}

function showSaleMessage(message) {
  el.salePreview.textContent = message;
}

function renderReports() {
  const selectedDate = getSelectedReportDate();
  const rangeSales = salesInRange(reportRange, selectedDate);
  const label = reportRangeLabel(reportRange, selectedDate);

  el.reportLabel.textContent = label;
  el.reportRevenue.textContent = formatMoney(sumRevenue(rangeSales));
  el.reportOrders.textContent = `${rangeSales.length} đơn bán`;
  el.cashRevenue.textContent = formatMoney(sumRevenueByPayment(rangeSales, "cash"));
  el.transferRevenue.textContent = formatMoney(sumRevenueByPayment(rangeSales, "transfer"));

  const byProduct = new Map();
  const filter = normalizeText(el.productReportFilter.value);
  rangeSales.forEach((sale) => {
    saleItems(sale).forEach((item) => {
      const searchText = normalizeText(`${item.name} ${item.price}`);
      if (filter && !searchText.includes(filter)) return;

      const key = `${item.name}__${item.price}`;
      const current = byProduct.get(key) || { name: item.name, price: item.price, qty: 0, total: 0 };
      current.qty += item.qty;
      current.total += item.price * item.qty;
      byProduct.set(key, current);
    });
  });

  const rows = [...byProduct.values()].sort((a, b) => b.total - a.total);

  el.topProducts.innerHTML = rows.length
    ? rows
        .map((item) => `
          <article class="list-item product-report-item">
            <div>
              <p class="item-title">${escapeHtml(item.name)}</p>
              <p class="item-meta">Giá ${formatMoney(item.price)} · Đã bán ${item.qty}</p>
            </div>
            <strong>${formatMoney(item.total)}</strong>
          </article>
        `)
        .join("")
    : `<div class="empty">Chưa có sản phẩm khớp trong kỳ này.</div>`;
}

function renderHistory() {
  if (state.sales.length === 0) {
    el.saleHistory.innerHTML = `<div class="empty">Chưa có đơn bán nào.</div>`;
    return;
  }

  el.saleHistory.innerHTML = state.sales
    .slice(0, 50)
    .map((sale) => {
      const method = sale.paymentMethod || "cash";
      const items = saleItems(sale);
      return `
      <article class="list-item sale-item ${method}">
        <div>
          <p class="item-title">${escapeHtml(saleTitle(items))}</p>
          <p class="item-meta">${formatDateTime(sale.createdAt)} · ${formatMoney(sale.total)} · ${paymentMethodLabel(method)}</p>
          <p class="item-meta">${escapeHtml(items.map((item) => `${item.name} x ${item.qty}`).join(" · "))}</p>
        </div>
        <div class="item-actions">
          <button class="small-button" type="button" data-edit-sale="${sale.id}">Sửa</button>
          <button class="danger-button" type="button" data-delete-sale="${sale.id}">Xóa</button>
        </div>
      </article>
    `;
    })
    .join("");

  el.saleHistory.querySelectorAll("[data-edit-sale]").forEach((button) => {
    button.addEventListener("click", () => editSale(button.dataset.editSale));
  });

  el.saleHistory.querySelectorAll("[data-delete-sale]").forEach((button) => {
    button.addEventListener("click", () => deleteSale(button.dataset.deleteSale));
  });
}

function editSale(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;

  editingSaleId = sale.id;
  renderOrderItems(saleItems(sale));
  el.salePayment.value = sale.paymentMethod || "cash";
  el.saleSubmit.textContent = "Cập nhật đơn";
  el.cancelSaleEdit.classList.remove("hidden");
  switchTab("sell");
  updateSalePreview();
  el.orderItems.querySelector('[data-field="name"]').focus();
}

function deleteSale(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;

  const ok = confirm(`Xóa đơn "${saleTitle(saleItems(sale))}"?`);
  if (!ok) return;

  state.sales = state.sales.filter((item) => item.id !== id);
  if (editingSaleId === id) {
    resetSaleForm();
  }
  saveState();
  render();
}

function salesInRange(range, baseDate = new Date()) {
  return state.sales.filter((sale) => {
    const date = new Date(sale.createdAt);
    if (range === "day") {
      return date.toDateString() === baseDate.toDateString();
    }
    if (range === "month") {
      return date.getFullYear() === baseDate.getFullYear() && date.getMonth() === baseDate.getMonth();
    }
    return date.getFullYear() === baseDate.getFullYear();
  });
}

function getSelectedReportDate() {
  if (!el.reportDate.value) {
    return new Date();
  }

  const [year, month, day] = el.reportDate.value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function reportRangeLabel(range, date) {
  if (range === "day") {
    return `Ngày ${formatDateOnly(date)}`;
  }
  if (range === "month") {
    return `Tháng ${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }
  return `Năm ${date.getFullYear()}`;
}

function saleItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length > 0) {
    return sale.items.map((item) => ({
      name: item.name || sale.productName || "Sản phẩm",
      price: Number(item.price || 0),
      qty: Number(item.qty || 1),
    }));
  }

  return [
    {
      name: sale.productName || "Sản phẩm",
      price: Number(sale.unitPrice || sale.total || 0),
      qty: Number(sale.qty || 1),
    },
  ];
}

function saleTitle(items) {
  if (items.length === 1) {
    return items[0].name;
  }
  return `${items.length} sản phẩm`;
}

function sumOrderItems(items) {
  return items.reduce((total, item) => total + item.price * item.qty, 0);
}

function sumOrderQty(items) {
  return items.reduce((total, item) => total + item.qty, 0);
}

function sumRevenue(sales) {
  return sales.reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function sumRevenueByPayment(sales, paymentMethod) {
  return sales
    .filter((sale) => (sale.paymentMethod || "cash") === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function paymentMethodLabel(paymentMethod) {
  return paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt";
}

function formatMoney(value) {
  return currency.format(value);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
  }).format(value);
}

function formatDateInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

resetSaleForm();
render();
