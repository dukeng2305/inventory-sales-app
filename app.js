const STORAGE_KEY = "inventory-sales-offline-v1";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const state = loadState();
let reportRange = "day";
let editingSaleId = "";
let editingPurchaseId = "";
let editingProductId = "";
let selectedReportPayment = "";

const el = {
  overviewDate: document.querySelector("#overviewDate"),
  recentSales: document.querySelector("#recentSales"),
  saleHeading: document.querySelector("#saleHeading"),
  saleDescription: document.querySelector("#saleDescription"),
  productForm: document.querySelector("#productForm"),
  productFormTitle: document.querySelector("#productFormTitle"),
  productName: document.querySelector("#productName"),
  vietnamesePrice: document.querySelector("#vietnamesePrice"),
  internationalPrice: document.querySelector("#internationalPrice"),
  productSearch: document.querySelector("#productSearch"),
  productList: document.querySelector("#productList"),
  productStatus: document.querySelector("#productStatus"),
  importStatus: document.querySelector("#importStatus"),
  todayRevenue: document.querySelector("#todayRevenue"),
  todayOrders: document.querySelector("#todayOrders"),
  todayItems: document.querySelector("#todayItems"),
  saleForm: document.querySelector("#saleForm"),
  orderItems: document.querySelector("#orderItems"),
  addOrderItem: document.querySelector("#addOrderItem"),
  salePayment: document.querySelector("#salePayment"),
  saleDateTime: document.querySelector("#saleDateTime"),
  saleSubmit: document.querySelector("#saleSubmit"),
  cancelSaleEdit: document.querySelector("#cancelSaleEdit"),
  salePreview: document.querySelector("#salePreview"),
  reportStartDate: document.querySelector("#reportStartDate"),
  reportEndDate: document.querySelector("#reportEndDate"),
  reportLabel: document.querySelector("#reportLabel"),
  reportRevenue: document.querySelector("#reportRevenue"),
  reportOrders: document.querySelector("#reportOrders"),
  morningCashRevenue: document.querySelector("#morningCashRevenue"),
  morningTransferRevenue: document.querySelector("#morningTransferRevenue"),
  morningOrders: document.querySelector("#morningOrders"),
  afternoonCashRevenue: document.querySelector("#afternoonCashRevenue"),
  afternoonTransferRevenue: document.querySelector("#afternoonTransferRevenue"),
  afternoonOrders: document.querySelector("#afternoonOrders"),
  reportPurchaseCost: document.querySelector("#reportPurchaseCost"),
  reportPurchaseCount: document.querySelector("#reportPurchaseCount"),
  reportProfit: document.querySelector("#reportProfit"),
  reportProfitNote: document.querySelector("#reportProfitNote"),
  cashRevenue: document.querySelector("#cashRevenue"),
  transferRevenue: document.querySelector("#transferRevenue"),
  paymentOrdersPanel: document.querySelector("#paymentOrdersPanel"),
  paymentOrdersTitle: document.querySelector("#paymentOrdersTitle"),
  paymentOrders: document.querySelector("#paymentOrders"),
  productReportFilter: document.querySelector("#productReportFilter"),
  topProducts: document.querySelector("#topProducts"),
  saleHistory: document.querySelector("#saleHistory"),
  importBtn: document.querySelector("#importBtn"),
  importFile: document.querySelector("#importFile"),
  exportBtn: document.querySelector("#exportBtn"),
  // Purchase form
  purchaseForm: document.querySelector("#purchaseForm"),
  purchaseAmount: document.querySelector("#purchaseAmount"),
  purchaseDate: document.querySelector("#purchaseDate"),
  purchaseNote: document.querySelector("#purchaseNote"),
  purchaseSubmit: document.querySelector("#purchaseSubmit"),
  cancelPurchaseEdit: document.querySelector("#cancelPurchaseEdit"),
  purchasePreview: document.querySelector("#purchasePreview"),
  purchaseHistory: document.querySelector("#purchaseHistory"),
};

// ─── Tab switching ──────────────────────────────────────────────────────────

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelectorAll("[data-go]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab(control.dataset.go);
  });
});

document.querySelector("#addProduct").addEventListener("click", () => openProductForm());
document.querySelector("#cancelProduct").addEventListener("click", closeProductForm);
el.productSearch.addEventListener("input", renderProducts);
el.productList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-product]");
  if (button) openProductForm(state.products.find((product) => product.id === button.dataset.editProduct));
});

el.productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = el.productName.value.trim();
  const vietnamesePrice = el.vietnamesePrice.valueAsNumber;
  const internationalPrice = el.internationalPrice.valueAsNumber;
  if (!name || !validPrice(vietnamesePrice) || !validPrice(internationalPrice)) {
    el.productStatus.textContent = "Nhập tên sản phẩm và hai mức giá hợp lệ.";
    return;
  }
  const product = state.products.find((entry) => entry.id === editingProductId);
  if (product) Object.assign(product, { name, vietnamesePrice, internationalPrice });
  else state.products.unshift({ id: crypto.randomUUID(), name, vietnamesePrice, internationalPrice });
  saveState();
  closeProductForm();
  renderProducts();
  el.productStatus.textContent = product ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.";
});

// ─── Report range buttons ───────────────────────────────────────────────────

document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", () => {
    reportRange = button.dataset.range;
    document.querySelectorAll(".range-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    setReportRangeDates(reportRange);
    renderReports();
  });
});

setReportRangeDates("day");
el.reportStartDate.addEventListener("change", renderReports);
el.reportEndDate.addEventListener("change", renderReports);
el.productReportFilter.addEventListener("input", renderReports);

document.querySelectorAll("[data-payment-report]").forEach((card) => {
  card.addEventListener("click", () => toggleReportPayment(card.dataset.paymentReport));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleReportPayment(card.dataset.paymentReport);
    }
  });
});

// ─── Sale form ──────────────────────────────────────────────────────────────

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

el.orderItems.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  if (field !== "product" && field !== "tier") return;
  const row = event.target.closest(".order-row");
  if (field === "product") row.querySelector('[data-field="tier"]').value = "vietnamese";
  applyCatalogPrice(row);
  updateSalePreview();
});

el.saleForm.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-item]");
  if (!removeButton) return;

  const rows = [...el.orderItems.querySelectorAll(".order-row")];
  removeButton.closest(".order-row").remove();
  if (rows.length === 1) addOrderItemRow();
  updateSalePreview();
});

el.saleForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const items = collectOrderItems();
  const paymentMethod = el.salePayment.value;
  const saleDateTime = getSaleDateTimeIso();

  if (!items.length || items.length !== el.orderItems.children.length) {
    showSaleMessage("Vui lòng nhập đầy đủ sản phẩm, đơn giá và số lượng cho từng dòng.");
    return;
  }

  if (!saleDateTime) {
    showSaleMessage("Bạn cần chọn ngày giờ bán hợp lệ.");
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
    createdAt: saleDateTime,
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
  });

  saveState();
  resetSaleForm();
  render();
  showSaleMessage(`Đã lưu đơn: ${formatMoney(total)} · ${paymentMethodLabel(paymentMethod)}.`);
});

// ─── Purchase form ──────────────────────────────────────────────────────────

// Set default purchase date to today
el.purchaseDate.value = formatDateInput(new Date());

el.purchaseAmount.addEventListener("input", updatePurchasePreview);
el.purchaseNote.addEventListener("input", updatePurchasePreview);

el.cancelPurchaseEdit.addEventListener("click", resetPurchaseForm);

el.purchaseForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const amount = Number(el.purchaseAmount.value);
  const date = el.purchaseDate.value;
  const note = el.purchaseNote.value.trim();

  if (!amount || amount <= 0) {
    showPurchaseMessage("Vui lòng nhập số tiền hợp lệ.");
    return;
  }

  const editingPurchase = state.purchases.find((p) => p.id === editingPurchaseId);

  const purchaseData = { amount, date, note };

  if (editingPurchase) {
    Object.assign(editingPurchase, purchaseData);
    saveState();
    resetPurchaseForm();
    render();
    showPurchaseMessage(`Đã cập nhật nhập hàng: ${formatMoney(amount)}.`);
    return;
  }

  state.purchases.unshift({
    id: crypto.randomUUID(),
    ...purchaseData,
    createdAt: new Date().toISOString(),
  });

  saveState();
  resetPurchaseForm();
  render();
  showPurchaseMessage(`Đã lưu nhập hàng: ${formatMoney(amount)}${note ? " · " + note : ""}.`);
});

// ─── Export / Import ─────────────────────────────────────────────────────────

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

el.importBtn.addEventListener("click", () => {
  el.importFile.click();
});

el.importFile.addEventListener("change", async () => {
  const file = el.importFile.files[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    if (!payload || !Array.isArray(payload.sales)) {
      alert("File sao lưu không hợp lệ.");
      return;
    }

    const ok = confirm("Nhập file này sẽ thay thế dữ liệu hiện tại trên máy. Bạn có muốn tiếp tục?");
    if (!ok) return;

    state.sales = payload.sales;
    state.products = readProducts(payload.products);
    state.purchases = Array.isArray(payload.purchases) ? payload.purchases : [];
    saveState();
    resetSaleForm();
    resetPurchaseForm();
    closeProductForm();
    render();
    el.importStatus.textContent = "Đã nhập dữ liệu sao lưu.";
  } catch (error) {
    alert("Không thể đọc file sao lưu.");
  } finally {
    el.importFile.value = "";
  }
});

// ─── State ───────────────────────────────────────────────────────────────────

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    return {
      products: readProducts(parsed.products),
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    };
  }

  return { sales: [], purchases: [], products: [] };
}

function validPrice(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function readProducts(products) {
  if (!Array.isArray(products)) return [];

  const result = [];
  for (const product of products) {
    if (!product || typeof product.id !== "string" || !product.id ||
        typeof product.name !== "string" || !product.name.trim()) continue;

    const vietnamesePrice = product.vietnamesePrice ?? product.retailPrice;
    const internationalPrice = product.internationalPrice ?? product.wholesalePrice;
    if (validPrice(vietnamesePrice) && validPrice(internationalPrice)) {
      result.push({ id: product.id, name: product.name, vietnamesePrice, internationalPrice });
    }
  }
  return result;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function switchTab(tabName) {
  const navTab = { sell: "history", purchase: "more" }[tabName] || tabName;
  document.querySelectorAll(".tab-button").forEach((item) => {
    const active = item.dataset.tab === navTab;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tab-panel").forEach((item) => {
    item.classList.toggle("active", item.id === tabName);
  });
  if (tabName === "sell") {
    el.orderItems.querySelectorAll('[data-field="product"]').forEach((select) => {
      const id = select.value;
      select.innerHTML = productOptions(id);
      if (id) applyCatalogPrice(select.closest(".order-row"));
    });
    if (collectOrderItems().length) updateSalePreview();
  }
  window.scrollTo(0, 0);
}

function openProductForm(product) {
  editingProductId = product?.id || "";
  el.productStatus.textContent = "";
  el.productFormTitle.textContent = product ? "Sửa sản phẩm" : "Thêm sản phẩm";
  el.productName.value = product?.name || "";
  el.vietnamesePrice.value = product?.vietnamesePrice ?? "";
  el.internationalPrice.value = product?.internationalPrice ?? "";
  el.productForm.classList.remove("hidden");
  el.productName.focus();
}

function closeProductForm() {
  editingProductId = "";
  el.productForm.reset();
  el.productForm.classList.add("hidden");
  el.productStatus.textContent = "";
}

function renderProducts() {
  const query = normalizeText(el.productSearch.value);
  const products = state.products.filter((product) => normalizeText(product.name).includes(query));
  el.productList.innerHTML = products.length ? products.map((product) => `
    <article class="list-item product-item">
      <div>
        <p class="item-title">${escapeHtml(product.name)}</p>
        <div class="product-prices">
          <span>Khách Việt Nam <strong>${formatMoney(product.vietnamesePrice)}</strong></span>
          <span>Khách nước ngoài <strong>${formatMoney(product.internationalPrice)}</strong></span>
        </div>
      </div>
      <button class="small-button" type="button" data-edit-product="${escapeAttribute(product.id)}">Sửa</button>
    </article>
  `).join("") : `<div class="empty">${query ? "Không tìm thấy sản phẩm." : "Chưa có sản phẩm. Chọn + Thêm để tạo sản phẩm và đặt giá."}</div>`;
}

// ─── Sale form helpers ───────────────────────────────────────────────────────

function resetSaleForm() {
  editingSaleId = "";
  el.salePayment.value = "cash";
  el.saleDateTime.value = formatDateTimeInput(new Date());
  el.saleHeading.textContent = "Tạo đơn bán";
  el.saleDescription.textContent = "Chọn sản phẩm và mức giá cho từng dòng.";
  el.saleSubmit.textContent = "Lưu đơn bán";
  el.cancelSaleEdit.classList.add("hidden");
  renderOrderItems([{}]);
  updateSalePreview();
}

function getSaleDateTimeIso() {
  if (!el.saleDateTime.value) return "";

  const date = new Date(el.saleDateTime.value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function productOptions(selected = "") {
  return '<option value="">Nhập sản phẩm thủ công</option>' + state.products.map((product) =>
    `<option value="${escapeAttribute(product.id)}"${product.id === selected ? " selected" : ""}>${escapeHtml(product.name)}</option>`
  ).join("");
}

function orderItemTemplate(item) {
  const saved = item.saved === true;
  return `
    <div class="order-row"${saved ? ' data-saved="true"' : ""}>
      ${saved ? "" : `<label class="catalog-field">Chọn sản phẩm
        <select data-field="product">${productOptions()}</select>
      </label>`}
      <label class="name-field">Tên sản phẩm
        <input data-field="name" type="text" placeholder="Nhập tên sản phẩm" value="${escapeAttribute(item.name ?? "")}" ${saved ? "readonly" : "required"} />
      </label>
      ${saved ? "" : `<label class="tier-field hidden">Giá theo khách
        <select data-field="tier">
          <option value="vietnamese">Khách Việt Nam</option>
          <option value="international">Khách nước ngoài</option>
        </select>
      </label>`}
      <label>
        ${saved ? "Đơn giá đã lưu" : "Đơn giá (đ)"}
        <input data-field="price" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${escapeAttribute(item.price ?? "")}" ${saved ? "readonly" : "required"} />
      </label>
      <label>
        Số lượng
        <input data-field="qty" type="number" inputmode="numeric" min="1" step="1" value="${escapeAttribute(item.qty ?? 1)}" required />
      </label>
      <button class="danger-button remove-item-button" type="button" data-remove-item aria-label="Xóa dòng sản phẩm">Xóa</button>
      ${saved ? `<input type="hidden" data-saved-product value="${escapeAttribute(item.productId ?? "")}" /><input type="hidden" data-saved-tier value="${escapeAttribute(item.priceTier ?? "")}" />` : ""}
    </div>
  `;
}

function applyCatalogPrice(row) {
  const product = state.products.find((entry) => entry.id === row.querySelector('[data-field="product"]').value);
  const name = row.querySelector('[data-field="name"]');
  const price = row.querySelector('[data-field="price"]');
  const tier = row.querySelector('[data-field="tier"]');
  name.closest("label").classList.toggle("hidden", !!product);
  tier.closest("label").classList.toggle("hidden", !product);
  name.readOnly = price.readOnly = !!product;
  name.value = product?.name ?? "";
  price.value = product ? (tier.value === "international" ? product.internationalPrice : product.vietnamesePrice) : "";
}

function renderOrderItems(items) {
  el.orderItems.innerHTML = items.map(orderItemTemplate).join("");
}

function addOrderItemRow() {
  el.orderItems.insertAdjacentHTML("beforeend", orderItemTemplate({}));
  el.orderItems.lastElementChild.querySelector('[data-field="product"]').focus();
}

function collectOrderItems() {
  return [...el.orderItems.querySelectorAll(".order-row")]
    .map((row) => {
      const name = row.querySelector('[data-field="name"]').value.trim();
      const price = row.querySelector('[data-field="price"]').valueAsNumber;
      const qty = row.querySelector('[data-field="qty"]').valueAsNumber;
      const productId = row.querySelector('[data-field="product"], [data-saved-product]')?.value;
      const priceTier = row.querySelector('[data-field="tier"], [data-saved-tier]')?.value;
      return { name, price, qty, ...(productId ? { productId, priceTier } : {}) };
    })
    .filter((item, index) => item.name && Number.isSafeInteger(item.qty) && item.qty > 0 &&
      (validPrice(item.price) || (el.orderItems.children[index].dataset.saved && Number.isFinite(item.price))));
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

// ─── Purchase form helpers ───────────────────────────────────────────────────

function resetPurchaseForm() {
  editingPurchaseId = "";
  el.purchaseAmount.value = "";
  el.purchaseDate.value = formatDateInput(new Date());
  el.purchaseNote.value = "";
  el.purchaseSubmit.textContent = "Lưu nhập hàng";
  el.cancelPurchaseEdit.classList.add("hidden");
  showPurchaseMessage("Nhập số tiền để ghi nhận chi phí vốn.");
}

function updatePurchasePreview() {
  const amount = Number(el.purchaseAmount.value);
  const note = el.purchaseNote.value.trim();
  if (!amount || amount <= 0) {
    showPurchaseMessage("Nhập số tiền để ghi nhận chi phí vốn.");
    return;
  }
  showPurchaseMessage(`Sẽ ghi nhận: ${formatMoney(amount)}${note ? " · " + note : ""}`);
}

function showPurchaseMessage(message) {
  el.purchasePreview.textContent = message;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  renderSummary();
  renderReports();
  renderHistory();
  renderPurchaseHistory();
  renderProducts();
}

function renderSummary() {
  const today = new Date();
  const todaySales = salesInDateRange(startOfDay(today), endOfDay(today));
  el.overviewDate.textContent = new Intl.DateTimeFormat("vi-VN", { dateStyle: "full" }).format(today);
  el.recentSales.innerHTML = state.sales.slice(0, 3).map((sale) => `
    <article class="list-item recent-sale">
      <div><p class="item-title">${escapeHtml(saleTitle(saleItems(sale)))}</p>
      <p class="item-meta">${formatDateTime(sale.createdAt)} · ${paymentMethodLabel(sale.paymentMethod)}</p></div>
      <strong>${formatMoney(sale.total)}</strong>
    </article>
  `).join("") || '<div class="empty">Chưa có đơn hàng. Tạo đơn để bắt đầu bán hàng.</div>';
  el.todayRevenue.textContent = formatMoney(sumRevenue(todaySales));
  el.todayOrders.textContent = todaySales.length;
  el.todayItems.textContent = todaySales.reduce((total, sale) => total + sumOrderQty(saleItems(sale)), 0);
}

function renderReports() {
  const { start, end } = getReportDateRange();
  const rangeSales = salesInDateRange(start, end);
  const rangePurchases = purchasesInDateRange(start, end);
  const label = reportRangeLabel(start, end);

  const totalRevenue = sumRevenue(rangeSales);
  const totalCost = sumPurchases(rangePurchases);
  const profit = totalRevenue - totalCost;
  const morningSales = salesInShift(rangeSales, "morning");
  const afternoonSales = salesInShift(rangeSales, "afternoon");

  el.reportLabel.textContent = label;
  el.reportRevenue.textContent = formatMoney(totalRevenue);
  el.reportOrders.textContent = `${rangeSales.length} đơn bán`;
  el.morningCashRevenue.textContent = formatMoney(sumRevenueByPayment(morningSales, "cash"));
  el.morningTransferRevenue.textContent = formatMoney(sumRevenueByPayment(morningSales, "transfer"));
  el.morningOrders.textContent = `${morningSales.length} đơn`;
  el.afternoonCashRevenue.textContent = formatMoney(sumRevenueByPayment(afternoonSales, "cash"));
  el.afternoonTransferRevenue.textContent = formatMoney(sumRevenueByPayment(afternoonSales, "transfer"));
  el.afternoonOrders.textContent = `${afternoonSales.length} đơn`;
  el.cashRevenue.textContent = formatMoney(sumRevenueByPayment(rangeSales, "cash"));
  el.transferRevenue.textContent = formatMoney(sumRevenueByPayment(rangeSales, "transfer"));
  renderReportPaymentOrders(rangeSales, label);

  // Profit section
  el.reportPurchaseCost.textContent = formatMoney(totalCost);
  el.reportPurchaseCount.textContent = `${rangePurchases.length} lần nhập`;
  el.reportProfit.textContent = formatMoney(profit);
  el.reportProfit.classList.toggle("profit-negative", profit < 0);
  el.reportProfitNote.textContent = profit >= 0
    ? `Lãi ${formatMoney(profit)}`
    : `Lỗ ${formatMoney(Math.abs(profit))}`;

  // Top products
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

function toggleReportPayment(paymentMethod) {
  selectedReportPayment = selectedReportPayment === paymentMethod ? "" : paymentMethod;
  renderReports();
}

function renderReportPaymentOrders(rangeSales, label) {
  document.querySelectorAll("[data-payment-report]").forEach((card) => {
    card.classList.toggle("active", card.dataset.paymentReport === selectedReportPayment);
  });

  if (!selectedReportPayment) {
    el.paymentOrdersPanel.classList.add("hidden");
    el.paymentOrders.innerHTML = "";
    return;
  }

  const sales = rangeSales.filter((sale) => (sale.paymentMethod || "cash") === selectedReportPayment);
  const methodLabel = paymentMethodLabel(selectedReportPayment);
  el.paymentOrdersPanel.classList.remove("hidden");
  el.paymentOrdersTitle.textContent = `Đơn hàng ${methodLabel.toLowerCase()} · ${label}`;
  el.paymentOrders.innerHTML = sales.length
    ? sales
        .map((sale) => {
          const items = saleItems(sale);
          return `
            <article class="list-item sale-item ${selectedReportPayment}">
              <div>
                <p class="item-title">${escapeHtml(saleTitle(items))}</p>
                <p class="item-meta">${formatDateTime(sale.createdAt)} · ${formatMoney(sale.total)}</p>
                <p class="item-meta">${escapeHtml(items.map((item) => `${item.name} × ${item.qty} · ${formatMoney(item.price)}/sp`).join(" · "))}</p>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty">Không có đơn ${methodLabel.toLowerCase()} trong khoảng ngày này.</div>`;
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
          <p class="item-meta">${escapeHtml(items.map((item) => `${item.name} × ${item.qty} · ${formatMoney(item.price)}/sp`).join(" · "))}</p>
        </div>
        <div class="item-actions">
          <button class="small-button" type="button" data-edit-sale="${escapeAttribute(sale.id)}">Sửa</button>
          <button class="danger-button" type="button" data-delete-sale="${escapeAttribute(sale.id)}">Xóa</button>
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

function renderPurchaseHistory() {
  if (state.purchases.length === 0) {
    el.purchaseHistory.innerHTML = `<div class="empty">Chưa có lần nhập hàng nào.</div>`;
    return;
  }

  el.purchaseHistory.innerHTML = state.purchases
    .slice(0, 50)
    .map((purchase) => `
      <article class="list-item purchase-item">
        <div>
          <p class="item-title">${formatMoney(purchase.amount)}</p>
          <p class="item-meta">${formatDateOnly(parseDateInput(purchase.date))}${purchase.note ? " · " + escapeHtml(purchase.note) : ""}</p>
        </div>
        <div class="item-actions">
          <button class="small-button" type="button" data-edit-purchase="${purchase.id}">Sửa</button>
          <button class="danger-button" type="button" data-delete-purchase="${purchase.id}">Xóa</button>
        </div>
      </article>
    `)
    .join("");

  el.purchaseHistory.querySelectorAll("[data-edit-purchase]").forEach((button) => {
    button.addEventListener("click", () => editPurchase(button.dataset.editPurchase));
  });

  el.purchaseHistory.querySelectorAll("[data-delete-purchase]").forEach((button) => {
    button.addEventListener("click", () => deletePurchase(button.dataset.deletePurchase));
  });
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

function editSale(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;

  editingSaleId = sale.id;
  renderOrderItems(saleItems(sale).map((item) => ({ ...item, saved: true })));
  el.saleHeading.textContent = "Sửa đơn bán";
  el.saleDescription.textContent = "Các dòng đã lưu giữ nguyên đơn giá ban đầu.";
  el.salePayment.value = sale.paymentMethod || "cash";
  el.saleDateTime.value = formatDateTimeInput(new Date(sale.createdAt || Date.now()));
  el.saleSubmit.textContent = "Cập nhật đơn";
  el.cancelSaleEdit.classList.remove("hidden");
  switchTab("sell");
  updateSalePreview();
  el.orderItems.querySelector('[data-field="qty"]').focus();
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

function editPurchase(id) {
  const purchase = state.purchases.find((p) => p.id === id);
  if (!purchase) return;

  editingPurchaseId = purchase.id;
  el.purchaseAmount.value = purchase.amount;
  el.purchaseDate.value = purchase.date;
  el.purchaseNote.value = purchase.note || "";
  el.purchaseSubmit.textContent = "Cập nhật nhập hàng";
  el.cancelPurchaseEdit.classList.remove("hidden");
  switchTab("purchase");
  updatePurchasePreview();
  el.purchaseAmount.focus();
}

function deletePurchase(id) {
  const purchase = state.purchases.find((p) => p.id === id);
  if (!purchase) return;

  const label = purchase.note ? `"${purchase.note}"` : formatMoney(purchase.amount);
  const ok = confirm(`Xóa lần nhập hàng ${label}?`);
  if (!ok) return;

  state.purchases = state.purchases.filter((p) => p.id !== id);
  if (editingPurchaseId === id) {
    resetPurchaseForm();
  }
  saveState();
  render();
}

// ─── Date range helpers ───────────────────────────────────────────────────────

function salesInDateRange(startDate, endDate) {
  return state.sales.filter((sale) => {
    const date = new Date(sale.createdAt);
    return date >= startDate && date <= endDate;
  });
}

function salesInShift(sales, shift) {
  return sales.filter((sale) => {
    const hour = new Date(sale.createdAt).getHours();
    return shift === "morning" ? hour < 14 : hour >= 14;
  });
}

function purchasesInDateRange(startDate, endDate) {
  return state.purchases.filter((purchase) => {
    // purchases use a date string (YYYY-MM-DD), compare as start of that day
    const date = parseDateInput(purchase.date);
    return date >= startOfDay(startDate) && date <= endOfDay(endDate);
  });
}

function setReportRangeDates(range) {
  const today = new Date();
  let start = today;
  let end = today;

  if (range === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }

  if (range === "year") {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear(), 11, 31);
  }

  el.reportStartDate.value = formatDateInput(start);
  el.reportEndDate.value = formatDateInput(end);
}

function getReportDateRange() {
  const start = parseDateInput(el.reportStartDate.value) || new Date();
  const end = parseDateInput(el.reportEndDate.value) || start;

  if (start > end) {
    return { start: startOfDay(end), end: endOfDay(start) };
  }

  return { start: startOfDay(start), end: endOfDay(end) };
}

function reportRangeLabel(start, end) {
  if (start.toDateString() === end.toDateString()) {
    return `Ngày ${formatDateOnly(start)}`;
  }
  return `${formatDateOnly(start)} - ${formatDateOnly(end)}`;
}

// ─── Sale data helpers ────────────────────────────────────────────────────────

function saleItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length > 0) {
    return sale.items.map((item) => ({
      name: item.name || sale.productName || "Sản phẩm",
      price: Number(item.price ?? 0),
      productId: item.productId,
      priceTier: item.priceTier,
      qty: Number(item.qty || 1),
    }));
  }

  return [
    {
      name: sale.productName || "Sản phẩm",
      price: Number(sale.unitPrice ?? sale.total ?? 0),
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

function sumPurchases(purchases) {
  return purchases.reduce((total, p) => total + Number(p.amount || 0), 0);
}

function paymentMethodLabel(paymentMethod) {
  return paymentMethod === "transfer" ? "Chuyển khoản" : "Tiền mặt";
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

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

function formatDateTimeInput(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
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

// ─── Init ─────────────────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

resetSaleForm();
render();
