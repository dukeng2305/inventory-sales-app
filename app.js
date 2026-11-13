const STORAGE_KEY = "inventory-sales-offline-v1";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const DEFAULT_BRANCH = "ninh-binh";
const BRANCH_LABELS = { "ninh-binh": "Ninh Bình", "ha-noi": "Hà Nội" };
const BRANCH_KEY = "inventory-sales-active-branch";

const state = loadState();
let activeBranch = branchId(localStorage.getItem(BRANCH_KEY));
let reportRange = "day";
let overviewPeriod = "day";
let editingSaleId = "";
let editingPurchaseId = "";
let editingProductId = "";
let selectedReportPayment = "";
let pickerQuantities = new Map();
let pickerView = "list";

const el = {
  productPicker: document.querySelector("#productPicker"),
  pickerSearch: document.querySelector("#pickerSearch"),
  pickerResults: document.querySelector("#pickerResults"),
  pickerSelectedCount: document.querySelector("#pickerSelectedCount"),
  pickerTotal: document.querySelector("#pickerTotal"),
  orderEmpty: document.querySelector("#orderEmpty"),
  branchSelect: document.querySelector("#branchSelect"),
  overviewDate: document.querySelector("#overviewDate"),
  recentSales: document.querySelector("#recentSales"),
  saleHeading: document.querySelector("#saleHeading"),
  saleDescription: document.querySelector("#saleDescription"),
  productStock: document.querySelector("#productStock"),
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

document.querySelectorAll("[data-overview-period]").forEach((button) => {
  button.addEventListener("click", () => {
    overviewPeriod = button.dataset.overviewPeriod;
    document.querySelectorAll("[data-overview-period]").forEach((control) =>
      control.setAttribute("aria-pressed", String(control === button)));
    renderOverviewChart();
  });
});
window.addEventListener("resize", renderOverviewChart);
document.querySelector("#overviewDetails").addEventListener("click", () => {
  const { start, end } = overviewDates(new Date(), overviewPeriod);
  el.reportStartDate.value = formatDateInput(start);
  el.reportEndDate.value = formatDateInput(new Date(end - 1));
  document.querySelectorAll(".range-button").forEach((button) => button.classList.remove("active"));
  switchTab("reports");
  renderReports();
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
  const stock = el.productStock.value === "" ? null : el.productStock.valueAsNumber;
  if (stock !== null && !Number.isSafeInteger(stock)) {
    el.productStatus.textContent = "Số lượng tồn kho phải là số nguyên.";
    return;
  }
  const details = { name, vietnamesePrice, internationalPrice, stock };
  const product = state.products.find((entry) => entry.id === editingProductId);
  if (product) Object.assign(product, details);
  else state.products.unshift({ id: crypto.randomUUID(), branchId: activeBranch, ...details });
  saveState();
  closeProductForm();
  renderProducts();
  el.productStatus.textContent = product ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.";
});

el.branchSelect.value = activeBranch;
el.branchSelect.addEventListener("change", () => {
  const nextBranch = branchId(el.branchSelect.value);
  const hasSaleDraft = [...el.orderItems.querySelectorAll('[data-field="name"], [data-field="price"]')]
    .some((input) => input.value) || editingSaleId;
  const hasPurchaseDraft = editingPurchaseId || el.purchaseAmount.value || el.purchaseNote.value;
  if ((hasSaleDraft || hasPurchaseDraft || !el.productForm.classList.contains("hidden")) &&
      !confirm("Đổi chi nhánh sẽ bỏ nội dung chưa lưu. Bạn có muốn tiếp tục?")) {
    el.branchSelect.value = activeBranch;
    return;
  }
  activeBranch = nextBranch;
  localStorage.setItem(BRANCH_KEY, activeBranch);
  selectedReportPayment = "";
  resetSaleForm();
  resetPurchaseForm();
  closeProductForm();
  el.importStatus.textContent = "";
  render();
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

el.addOrderItem.addEventListener("click", openProductPicker);
document.querySelector("#addManualItem").addEventListener("click", () => {
  addOrderItemRow();
  updateSalePreview();
});
document.querySelector("#cancelPicker").addEventListener("click", () => el.productPicker.close());
el.productPicker.addEventListener("close", () => {
  document.body.classList.remove("picker-open");
  el.addOrderItem.focus();
});
el.pickerSearch.addEventListener("input", renderPickerProducts);
document.querySelectorAll("[data-picker-view]").forEach((button) => {
  button.addEventListener("click", () => {
    pickerView = button.dataset.pickerView;
    renderPickerProducts();
  });
});
el.pickerResults.addEventListener("click", (event) => {
  const control = event.target.closest("[data-picker-product]");
  if (!control) return;
  const id = control.dataset.pickerProduct;
  const current = pickerQuantities.get(id) || 0;
  const next = Math.max(0, current + Number(control.dataset.change));
  if (!Number.isSafeInteger(next)) return;
  if (next) pickerQuantities.set(id, next);
  else pickerQuantities.delete(id);
  renderPickerProducts();
  const row = [...el.pickerResults.querySelectorAll(".picker-product")]
    .find((item) => item.dataset.id === id);
  const action = control.dataset.change === "-1" && next ? "-1" : "1";
  row?.querySelector(`[data-change="${action}"]`)?.focus({ preventScroll: true });
});
document.querySelector("#completePicker").addEventListener("click", completeProductPicker);

el.cancelSaleEdit.addEventListener("click", resetSaleForm);

el.saleForm.addEventListener("input", (event) => {
  if (event.target.matches("[data-field]")) {
    updateSalePreview();
  }
});

el.orderItems.addEventListener("change", (event) => {
  if (event.target.dataset.field !== "tier") return;
  applyCatalogPrice(event.target.closest(".order-row"));
  updateSalePreview();
});

el.saleForm.addEventListener("click", (event) => {
  const qtyButton = event.target.closest("[data-qty-change]");
  if (qtyButton) {
    const input = qtyButton.closest(".order-row").querySelector('[data-field="qty"]');
    const next = input.valueAsNumber + Number(qtyButton.dataset.qtyChange);
    if (Number.isSafeInteger(next) && next >= 1) input.value = next;
    updateSalePreview();
    return;
  }
  const removeButton = event.target.closest("[data-remove-item]");
  if (!removeButton) return;
  removeButton.closest(".order-row").remove();
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

  const total = orderTotal(items);
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
    branchId: activeBranch,
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
    branchId: activeBranch,
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
    if (payload?.source === "sapo-stock") {
      importSapoStock(payload);
      return;
    }
    if (!payload || !Array.isArray(payload.sales)) {
      alert("File sao lưu không hợp lệ.");
      return;
    }

    if (payload.source === "sapo") {
      if (payload.branchId != null && !Object.hasOwn(BRANCH_LABELS, payload.branchId)) {
        alert("Chi nhánh trong file Sapo không hợp lệ.");
        return;
      }
      const products = readProducts(payload.products);
      if (!Array.isArray(payload.products) || products.length !== payload.products.length ||
          new Set(products.map((product) => product.id)).size !== products.length ||
          !payload.sales.every((sale) => sale && typeof sale.sapoOrderNumber === "string" &&
            sale.id === `sapo-order-${sale.sapoOrderNumber}` && Number.isFinite(Date.parse(sale.createdAt)) &&
            validPrice(sale.total) && sale.paymentMethod === "unknown" &&
            Array.isArray(sale.items) && sale.items.length && sale.items.every((item) =>
              item && typeof item.name === "string" && item.name.trim() && validPrice(item.price) &&
              Number.isSafeInteger(item.qty) && item.qty > 0)) ||
          new Set(payload.sales.map((sale) => sale.id)).size !== payload.sales.length) {
        alert("File dữ liệu Sapo không hợp lệ.");
        return;
      }
      const importBranch = branchId(payload.branchId);
      const branchLabel = BRANCH_LABELS[importBranch];
      const qualifyId = (id) => importBranch === DEFAULT_BRANCH ? id : `${importBranch}:${id}`;
      const importedProducts = products.map((product) => ({
        ...product, id: qualifyId(product.id), branchId: importBranch,
      }));
      const importedSales = payload.sales.map((sale) => ({
        ...sale,
        id: qualifyId(sale.id),
        branchId: importBranch,
        items: sale.items.map((item) => item.productId ? { ...item, productId: qualifyId(item.productId) } : item),
      }));
      const newProducts = importedProducts.filter((product) => !state.products.some((saved) => saved.id === product.id));
      const newSales = importedSales.filter((sale) => !state.sales.some((saved) => saved.id === sale.id));
      if (!newProducts.length && !newSales.length) {
        el.importStatus.textContent = "Dữ liệu Sapo trong file này đã được nhập.";
        return;
      }
      if (!confirm(`Thêm ${newProducts.length} sản phẩm và ${newSales.length} đơn từ Sapo vào chi nhánh ${branchLabel}?`)) return;
      state.products.push(...newProducts);
      state.sales = [...state.sales, ...newSales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      saveState();
      resetSaleForm();
      closeProductForm();
      render();
      el.importStatus.textContent = `Đã thêm ${newProducts.length} sản phẩm và ${newSales.length} đơn từ Sapo vào chi nhánh ${branchLabel}.`;
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

function importSapoStock(payload) {
  const { branchId: targetBranch, items } = payload;
  if (!Object.hasOwn(BRANCH_LABELS, targetBranch) || !Array.isArray(items) || !items.length ||
      !items.every((item) => typeof item?.id === "string" && Number.isSafeInteger(item.stock)) ||
      new Set(items.map((item) => item.id)).size !== items.length) {
    alert("File cập nhật tồn kho không hợp lệ.");
    return;
  }

  const counts = new Map(items.map(({ id, stock }) => [id, stock]));
  const matching = state.products.filter((product) =>
    recordBranch(product) === targetBranch && counts.has(product.id));
  const changes = matching.filter((product) => product.stock !== counts.get(product.id));
  const missing = items.length - matching.length;
  const branchLabel = BRANCH_LABELS[targetBranch];
  const note = missing ? ` ${missing} mã chưa có trong danh mục ${branchLabel}.` : "";
  if (!changes.length) {
    el.importStatus.textContent = `Không có số tồn cần cập nhật.${note}`;
    return;
  }
  if (!confirm(`Cập nhật số tồn của ${changes.length} sản phẩm tại ${branchLabel}?${note}`)) return;
  const updated = new Set(changes.map((product) => product.id));
  const next = { ...state, products: state.products.map((product) =>
    recordBranch(product) === targetBranch && updated.has(product.id)
      ? { ...product, stock: counts.get(product.id) } : product) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  state.products = next.products;
  closeProductForm();
  renderProducts();
  el.importStatus.textContent = `Đã cập nhật số tồn của ${changes.length} sản phẩm tại ${branchLabel}.${note}`;
}

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

function branchId(value) {
  return value === "ha-noi" ? value : DEFAULT_BRANCH;
}

function recordBranch(record) {
  if (Object.hasOwn(BRANCH_LABELS, record.branchId)) return record.branchId;
  if (typeof record.id === "string" &&
      (record.id.startsWith("sapo-order-") || record.id.startsWith("sapo-product-"))) {
    return "ninh-binh";
  }
  return "ha-noi";
}

function forActiveBranch(records) {
  return records.filter((record) => recordBranch(record) === activeBranch);
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
      result.push({ id: product.id, branchId: recordBranch(product), name: product.name, vietnamesePrice, internationalPrice,
        stock: Number.isSafeInteger(product.stock) ? product.stock : null,
        sku: typeof product.sku === "string" ? product.sku : "",
        barcode: typeof product.barcode === "string" ? product.barcode : "" });
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
    if (collectOrderItems().length) updateSalePreview();
  }
  if (tabName === "overview") renderOverviewChart();
  window.scrollTo(0, 0);
}

function openProductForm(product) {
  editingProductId = product?.id || "";
  el.productStatus.textContent = "";
  el.productFormTitle.textContent = product ? "Sửa sản phẩm" : "Thêm sản phẩm";
  el.productName.value = product?.name || "";
  el.vietnamesePrice.value = product?.vietnamesePrice ?? "";
  el.internationalPrice.value = product?.internationalPrice ?? "";
  el.productStock.value = product?.stock ?? "";
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
  const products = forActiveBranch(state.products).filter((product) => normalizeText(product.name).includes(query));
  el.productList.innerHTML = products.length ? products.map((product) => `
    <button class="list-item product-item" type="button" data-edit-product="${escapeAttribute(product.id)}" aria-label="Sửa ${escapeAttribute(product.name)}">
      <span>
        <span class="item-title">${escapeHtml(product.name)}</span>
        <span class="item-meta">Tồn kho: <strong>${product.stock == null ? "Chưa cập nhật" : product.stock.toLocaleString("vi-VN")}</strong></span>
        <span class="product-prices">
          <span>Khách Việt Nam <strong>${formatMoney(product.vietnamesePrice)}</strong></span>
          <span>Khách nước ngoài <strong>${formatMoney(product.internationalPrice)}</strong></span>
        </span>
      </span>
    </button>
  `).join("") : `<div class="empty">${query ? "Không tìm thấy sản phẩm." : "Chưa có sản phẩm. Chọn + Thêm để tạo sản phẩm và đặt giá."}</div>`;
}

// ─── Sale form helpers ───────────────────────────────────────────────────────

function resetSaleForm() {
  editingSaleId = "";
  el.salePayment.value = "cash";
  el.saleDateTime.value = formatDateTimeInput(new Date());
  el.saleHeading.textContent = "POS · Tạo đơn";
  el.saleDescription.textContent = "Chọn sản phẩm và mức giá cho từng dòng.";
  el.saleSubmit.textContent = "Lưu đơn bán";
  el.cancelSaleEdit.classList.add("hidden");
  renderOrderItems([]);
  updateSalePreview();
}

function getSaleDateTimeIso() {
  if (!el.saleDateTime.value) return "";

  const date = new Date(el.saleDateTime.value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function openProductPicker() {
  pickerQuantities = new Map();
  el.pickerSearch.value = "";
  document.querySelector("#pickerBranch").textContent = BRANCH_LABELS[activeBranch];
  renderPickerProducts();
  el.productPicker.showModal();
  document.body.classList.add("picker-open");
  document.querySelector("#cancelPicker").focus();
}

function pickerProducts() {
  const words = normalizeText(el.pickerSearch.value).split(/\s+/).filter(Boolean);
  return forActiveBranch(state.products).filter((product) => {
    const text = normalizeText(`${product.name} ${product.sku || ""} ${product.barcode || ""}`);
    return words.every((word) => text.includes(word));
  });
}

function renderPickerProducts() {
  const products = pickerProducts();
  el.pickerResults.classList.toggle("picker-grid", pickerView === "grid");
  document.querySelectorAll("[data-picker-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.pickerView === pickerView));
  });
  document.querySelector("#pickerResultCount").textContent = `${products.length} sản phẩm`;
  el.pickerResults.innerHTML = products.map((product) => {
    const qty = pickerQuantities.get(product.id) || 0;
    const id = escapeAttribute(product.id);
    const name = escapeHtml(product.name);
    return `
      <article class="picker-product${qty ? " selected" : ""}" data-id="${id}">
        <span class="product-thumbnail" aria-hidden="true">${escapeHtml(product.name.slice(0, 2).toUpperCase())}${qty ? `<b>${qty}</b>` : ""}</span>
        <div class="picker-product-info">
          <strong>${name}</strong>
          <span class="picker-product-price">${formatMoney(product.vietnamesePrice)}</span>
          ${product.sku ? `<small>${escapeHtml(product.sku)}</small>` : ""}
          <small>Tồn kho: <span class="${product.stock != null && product.stock <= 0 ? "stock-low" : ""}">${product.stock == null ? "Chưa cập nhật" : product.stock.toLocaleString("vi-VN")}</span></small>
        </div>
        <div class="qty-stepper">
          ${qty ? `<button type="button" data-picker-product="${id}" data-change="-1" aria-label="Giảm ${escapeAttribute(product.name)}">−</button><output>${qty}</output>` : ""}
          <button type="button" data-picker-product="${id}" data-change="1" aria-label="Thêm ${escapeAttribute(product.name)}">＋</button>
        </div>
      </article>`;
  }).join("") || `<div class="empty">${state.products.some((product) => recordBranch(product) === activeBranch)
    ? "Không tìm thấy sản phẩm. Thử tên hoặc mã khác."
    : "Chi nhánh này chưa có sản phẩm. Thêm sản phẩm tại mục Sản phẩm hoặc nhập thủ công trong đơn."}</div>`;
  let qty = 0;
  let total = 0;
  for (const product of forActiveBranch(state.products)) {
    const count = pickerQuantities.get(product.id) || 0;
    qty += count;
    total += count * product.vietnamesePrice;
  }
  el.pickerSelectedCount.textContent = qty ? `Đã chọn ${qty} sản phẩm` : "Chưa chọn sản phẩm";
  el.pickerTotal.textContent = formatMoney(total);
}

function completeProductPicker() {
  for (const product of forActiveBranch(state.products)) {
    const qty = pickerQuantities.get(product.id);
    if (!qty) continue;
    const row = [...el.orderItems.querySelectorAll(".order-row:not([data-saved])")]
      .find((entry) => entry.querySelector('[data-field="product"]').value === product.id &&
        entry.querySelector('[data-field="tier"]').value === "vietnamese" &&
        entry.querySelector('[data-field="price"]').valueAsNumber === product.vietnamesePrice);
    const input = row?.querySelector('[data-field="qty"]');
    if (input && Number.isSafeInteger(input.valueAsNumber + qty)) {
      input.value = input.valueAsNumber + qty;
    } else {
      el.orderItems.insertAdjacentHTML("beforeend", orderItemTemplate({
        productId: product.id, name: product.name, price: product.vietnamesePrice, qty,
      }));
    }
  }
  updateSalePreview();
  el.productPicker.close();
}

function orderItemTemplate(item) {
  const saved = item.saved === true;
  const product = !saved && forActiveBranch(state.products).find((entry) => entry.id === item.productId);
  const tier = item.priceTier || "vietnamese";
  return `
    <div class="order-row"${saved ? ' data-saved="true"' : ""}>
      <input type="hidden" data-field="product" value="${escapeAttribute(product?.id || "")}" />
      ${product || saved ? `<p class="order-product-name">${escapeHtml(item.name)}</p>` : ""}
      <label class="name-field${product || saved ? " hidden" : ""}">Tên sản phẩm
        <input data-field="name" type="text" placeholder="Nhập tên sản phẩm" value="${escapeAttribute(item.name ?? "")}" ${product || saved ? "readonly" : "required"} />
      </label>
      ${saved || !product ? "" : `<label class="tier-field">Giá theo khách
        <select data-field="tier">
          <option value="vietnamese"${tier === "vietnamese" ? " selected" : ""}>Khách Việt Nam</option>
          <option value="international"${tier === "international" ? " selected" : ""}>Khách nước ngoài</option>
        </select>
      </label>`}
      <label>
        ${saved ? "Đơn giá đã lưu" : "Đơn giá (đ)"}
        <input data-field="price" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${escapeAttribute(item.price ?? "")}" ${saved || product ? "readonly" : "required"} />
      </label>
      <label class="order-quantity">
        Số lượng
        <span class="qty-stepper">
          <button type="button" data-qty-change="-1" aria-label="Giảm số lượng">−</button>
          <input data-field="qty" type="number" inputmode="numeric" min="1" step="1" value="${escapeAttribute(item.qty ?? 1)}" required />
          <button type="button" data-qty-change="1" aria-label="Tăng số lượng">＋</button>
        </span>
      </label>
      <button class="danger-button remove-item-button" type="button" data-remove-item aria-label="Xóa dòng sản phẩm">Xóa</button>
      ${saved ? `<input type="hidden" data-saved-product value="${escapeAttribute(item.productId ?? "")}" /><input type="hidden" data-saved-tier value="${escapeAttribute(item.priceTier ?? "")}" />` : ""}
    </div>
  `;
}

function applyCatalogPrice(row) {
  const product = forActiveBranch(state.products).find((entry) => entry.id === row.querySelector('[data-field="product"]').value);
  if (!product) return;
  const tier = row.querySelector('[data-field="tier"]').value;
  row.querySelector('[data-field="price"]').value = tier === "international"
    ? product.internationalPrice : product.vietnamesePrice;
}

function renderOrderItems(items) {
  el.orderItems.innerHTML = items.map(orderItemTemplate).join("");
}

function addOrderItemRow() {
  el.orderItems.insertAdjacentHTML("beforeend", orderItemTemplate({}));
  el.orderItems.lastElementChild.querySelector('[data-field="name"]').focus();
}

function collectOrderItems() {
  return [...el.orderItems.querySelectorAll(".order-row")]
    .map((row) => {
      const name = row.querySelector('[data-field="name"]').value.trim();
      const price = row.querySelector('[data-field="price"]').valueAsNumber;
      const qty = row.querySelector('[data-field="qty"]').valueAsNumber;
      const productId = row.dataset.saved ? row.querySelector("[data-saved-product]").value : row.querySelector('[data-field="product"]').value;
      const priceTier = row.querySelector('[data-field="tier"], [data-saved-tier]')?.value;
      return { name, price, qty, ...(productId ? { productId, priceTier } : {}) };
    })
    .filter((item, index) => item.name && Number.isSafeInteger(item.qty) && item.qty > 0 &&
      (validPrice(item.price) || (el.orderItems.children[index].dataset.saved && Number.isFinite(item.price))));
}

function updateSalePreview() {
  const items = collectOrderItems();
  el.orderEmpty.classList.toggle("hidden", !!el.orderItems.children.length);
  if (items.length === 0) {
    showSaleMessage("Nhập sản phẩm để tạo đơn.");
    return;
  }
  showSaleMessage(`Tạm tính: ${formatMoney(orderTotal(items))} · ${items.length} sản phẩm.`);
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
  el.recentSales.innerHTML = forActiveBranch(state.sales).slice(0, 3).map((sale) => `
    <article class="list-item recent-sale">
      <div><p class="item-title">${escapeHtml(saleTitle(saleItems(sale)))}</p>
      <p class="item-meta">${formatDateTime(sale.createdAt)} · ${paymentMethodLabel(sale.paymentMethod)}</p></div>
      <strong>${formatMoney(sale.total)}</strong>
    </article>
  `).join("") || '<div class="empty">Chưa có đơn hàng. Tạo đơn để bắt đầu bán hàng.</div>';
  renderOverviewChart();
}

function overviewDates(now, period) {
  const day = startOfDay(now);
  const offsetDay = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
  if (period === "week") {
    const start = offsetDay(day, -((day.getDay() + 6) % 7));
    return { start, end: offsetDay(start, 7), previous: offsetDay(start, -7), count: 7 };
  }
  if (period === "month") {
    const year = day.getFullYear();
    const month = day.getMonth();
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1),
      previous: new Date(year, month - 1, 1),
      count: Math.max(new Date(year, month + 1, 0).getDate(), new Date(year, month, 0).getDate()) };
  }
  return { start: day, end: offsetDay(day, 1), previous: offsetDay(day, -1), count: 8 };
}

function renderOverviewChart() {
  const canvas = document.querySelector("#revenueChart");
  if (!canvas.clientWidth) return;
  const { start, end, previous, count } = overviewDates(new Date(), overviewPeriod);
  const bucket = (date) => overviewPeriod === "day" ? Math.floor(date.getHours() / 3)
    : overviewPeriod === "week" ? (date.getDay() + 6) % 7 : date.getDate() - 1;
  const current = Array(count).fill(0);
  const prior = Array(count).fill(0);
  const sales = [];
  for (const sale of forActiveBranch(state.sales)) {
    const date = new Date(sale.createdAt);
    if (date >= start && date < end) {
      sales.push(sale);
      current[bucket(date)] += Number(sale.total || 0);
    } else if (date >= previous && date < start) {
      prior[bucket(date)] += Number(sale.total || 0);
    }
  }
  const total = sumRevenue(sales);
  const priorTotal = prior.reduce((sum, value) => sum + value, 0);
  const delta = priorTotal ? ((total - priorTotal) / priorTotal * 100) : null;
  el.todayRevenue.textContent = formatMoney(total);
  el.todayOrders.textContent = sales.length;
  el.todayItems.textContent = sales.reduce((sum, sale) => sum + sumOrderQty(saleItems(sale)), 0);
  document.querySelector("#averageOrder").textContent = formatMoney(sales.length ? total / sales.length : 0);
  el.overviewDate.textContent = reportRangeLabel(start, new Date(end - 1));
  document.querySelector("#revenueChange").textContent = delta === null ? "So với kỳ trước"
    : `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(delta)}% so với kỳ trước`;
  const caption = `Kỳ trước: ${formatMoney(priorTotal)} · ${overviewPeriod === "day" ? "Mỗi điểm là 3 giờ" : "Mỗi điểm là 1 ngày"}`;
  document.querySelector("#chartCaption").textContent = caption;
  canvas.setAttribute("aria-label", `Doanh thu hiện tại ${formatMoney(total)}. ${caption}`);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const peak = Math.max(1000, ...current, ...prior);
  const magnitude = 10 ** Math.floor(Math.log10(peak / 4));
  const step = Math.ceil(peak / 4 / magnitude) * magnitude;
  const maximum = step * 4;
  const top = 12, bottom = height - 26, left = 50, right = width - 12;
  const x = (i) => left + i * (right - left) / (count - 1);
  const y = (value) => bottom - value * (bottom - top) / maximum;
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#53647e";
  ctx.textAlign = "right";
  const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
  for (let i = 0; i <= 4; i++) {
    const value = step * i;
    ctx.fillText(compact.format(value), left - 7, y(value) + 4);
    ctx.strokeStyle = "#dfe7f2";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
  }
  ctx.textAlign = "center";
  for (let i = 0; i < count; i++) {
    if (overviewPeriod === "month" && i % 5 !== 0) continue;
    if (overviewPeriod === "day" && width < 450 && i % 2 !== 0 && i !== count - 1) continue;
    const label = overviewPeriod === "day" ? `${String(i * 3).padStart(2, "0")}:00`
      : overviewPeriod === "week" ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i] : String(i + 1);
    ctx.fillText(label, x(i), height - 7);
  }
  for (const [values, color, dash] of [[prior, "#b86a13", [5, 4]], [current, "#0873dc", []]]) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    values.forEach((value, index) => index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value)));
    ctx.stroke();
    if (!dash.length && count < 10) values.forEach((value, index) => {
      ctx.beginPath();
      ctx.arc(x(index), y(value), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
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
  const unknownRevenue = sumRevenueByPayment(rangeSales, "unknown");
  document.querySelector("#unknownRevenue").textContent = rangeSales.some((sale) => sale.paymentMethod === "unknown")
    ? `Chưa rõ hình thức thanh toán: ${formatMoney(unknownRevenue)}` : "";
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
  const sales = forActiveBranch(state.sales);
  if (!sales.length) {
    el.saleHistory.innerHTML = `<div class="empty">Chưa có đơn bán nào.</div>`;
    return;
  }

  el.saleHistory.innerHTML = sales
    .map((sale) => {
      const method = ["cash", "transfer", "unknown"].includes(sale.paymentMethod) ? sale.paymentMethod : "cash";
      const items = saleItems(sale);
      return `
      <article class="list-item sale-item ${method}">
        <div>
          <p class="item-title">${sale.sapoOrderNumber ? escapeHtml(sale.sapoOrderNumber) + " · " : ""}${escapeHtml(saleTitle(items))}</p>
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
  const purchases = forActiveBranch(state.purchases);
  if (!purchases.length) {
    el.purchaseHistory.innerHTML = `<div class="empty">Chưa có lần nhập hàng nào.</div>`;
    return;
  }

  el.purchaseHistory.innerHTML = purchases
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
  return forActiveBranch(state.sales).filter((sale) => {
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
  return forActiveBranch(state.purchases).filter((purchase) => {
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

function orderTotal(items) {
  const saved = state.sales.find((sale) => sale.id === editingSaleId);
  const lineTotal = sumOrderItems(items);
  if (!saved || !saved.sapoOrderNumber) return lineTotal;
  const adjustment = saved.total - sumOrderItems(saleItems(saved));
  return Math.max(0, lineTotal + adjustment);
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
  if (paymentMethod === "unknown") return "Chưa rõ thanh toán";
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
