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
  lowStockCount: document.querySelector("#lowStockCount"),
  saleForm: document.querySelector("#saleForm"),
  saleProductId: document.querySelector("#saleProductId"),
  saleSearch: document.querySelector("#saleSearch"),
  saleSearchResults: document.querySelector("#saleSearchResults"),
  saleQty: document.querySelector("#saleQty"),
  salePayment: document.querySelector("#salePayment"),
  saleSubmit: document.querySelector("#saleSubmit"),
  cancelSaleEdit: document.querySelector("#cancelSaleEdit"),
  salePreview: document.querySelector("#salePreview"),
  productForm: document.querySelector("#productForm"),
  productId: document.querySelector("#productId"),
  productName: document.querySelector("#productName"),
  productPrice: document.querySelector("#productPrice"),
  productStock: document.querySelector("#productStock"),
  productLowStock: document.querySelector("#productLowStock"),
  resetProductForm: document.querySelector("#resetProductForm"),
  productList: document.querySelector("#productList"),
  reportDate: document.querySelector("#reportDate"),
  reportLabel: document.querySelector("#reportLabel"),
  reportRevenue: document.querySelector("#reportRevenue"),
  reportOrders: document.querySelector("#reportOrders"),
  cashRevenue: document.querySelector("#cashRevenue"),
  transferRevenue: document.querySelector("#transferRevenue"),
  topProducts: document.querySelector("#topProducts"),
  saleHistory: document.querySelector("#saleHistory"),
  exportBtn: document.querySelector("#exportBtn"),
};

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
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

el.productForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const product = {
    id: el.productId.value || crypto.randomUUID(),
    name: el.productName.value.trim(),
    price: Number(el.productPrice.value),
    stock: Number(el.productStock.value),
    lowStock: Number(el.productLowStock.value),
  };

  const existingIndex = state.products.findIndex((item) => item.id === product.id);
  if (existingIndex >= 0) {
    state.products[existingIndex] = product;
  } else {
    state.products.push(product);
  }

  saveState();
  resetProductForm();
  render();
});

el.resetProductForm.addEventListener("click", resetProductForm);

el.saleSearch.addEventListener("input", () => {
  el.saleProductId.value = "";
  el.saleSearchResults.classList.remove("hidden");
  renderSaleSearchResults();
  updateSalePreview();
});
el.saleSearch.addEventListener("focus", () => {
  if (!el.saleProductId.value) {
    el.saleSearchResults.classList.remove("hidden");
    renderSaleSearchResults();
  }
});
el.saleSearch.addEventListener("blur", () => {
  window.setTimeout(() => hideSaleSearchResults(), 120);
});
el.saleQty.addEventListener("input", updateSalePreview);
el.cancelSaleEdit.addEventListener("click", resetSaleForm);

el.saleForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const product = state.products.find((item) => item.id === el.saleProductId.value);
  const qty = Number(el.saleQty.value);
  const paymentMethod = el.salePayment.value;
  const editingSale = state.sales.find((sale) => sale.id === editingSaleId);

  if (!product) {
    showSaleMessage("Bạn cần thêm sản phẩm trước khi bán.");
    return;
  }

  const availableStock = product.stock + (editingSale?.productId === product.id ? editingSale.qty : 0);
  if (qty < 1 || qty > availableStock) {
    showSaleMessage("Số lượng bán không hợp lệ hoặc vượt quá tồn kho.");
    return;
  }

  if (editingSale) {
    const oldProduct = state.products.find((item) => item.id === editingSale.productId);
    if (oldProduct) {
      oldProduct.stock += editingSale.qty;
    }

    product.stock -= qty;
    editingSale.productId = product.id;
    editingSale.productName = product.name;
    editingSale.qty = qty;
    editingSale.unitPrice = product.price;
    editingSale.total = product.price * qty;
    editingSale.paymentMethod = paymentMethod;

    saveState();
    resetSaleForm();
    render();
    showSaleMessage(`Đã cập nhật đơn: ${product.name} x ${qty} · ${paymentMethodLabel(paymentMethod)}.`);
    return;
  }

  product.stock -= qty;
  state.sales.unshift({
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    qty,
    unitPrice: product.price,
    total: product.price * qty,
    paymentMethod,
    createdAt: new Date().toISOString(),
  });

  saveState();
  resetSaleForm();
  render();
  showSaleMessage(`Đã lưu đơn: ${product.name} x ${qty} · ${paymentMethodLabel(paymentMethod)}.`);
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
    return JSON.parse(saved);
  }

  return {
    products: [
      { id: crypto.randomUUID(), name: "Sản phẩm mẫu", price: 100000, stock: 20, lowStock: 5 },
    ],
    sales: [],
  };
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
  el.saleQty.value = 1;
  el.saleProductId.value = "";
  el.saleSearch.value = "";
  el.salePayment.value = "cash";
  hideSaleSearchResults();
  el.saleSubmit.textContent = "Lưu đơn bán";
  el.cancelSaleEdit.classList.add("hidden");
  updateSalePreview();
}

function resetProductForm() {
  el.productId.value = "";
  el.productName.value = "";
  el.productPrice.value = "";
  el.productStock.value = "";
  el.productLowStock.value = "5";
  el.productName.focus();
}

function render() {
  renderSummary();
  renderSaleOptions();
  renderProducts();
  renderReports();
  renderHistory();
}

function renderSummary() {
  const todaySales = salesInRange("day");
  el.todayRevenue.textContent = formatMoney(sumRevenue(todaySales));
  el.todayOrders.textContent = todaySales.length;
  el.lowStockCount.textContent = state.products.filter((item) => item.stock <= item.lowStock).length;
}

function renderSaleOptions() {
  const editingSale = state.sales.find((sale) => sale.id === editingSaleId);
  const availableProducts = state.products.filter((item) => item.stock > 0 || editingSale?.productId === item.id);
  if (!el.saleProductId.value && (el.saleSearch.value || document.activeElement === el.saleSearch)) {
    renderSaleSearchResults();
  } else {
    hideSaleSearchResults();
  }
  el.saleSubmit.disabled = availableProducts.length === 0;
  updateSalePreview();
}

function renderSaleSearchResults() {
  if (el.saleProductId.value) {
    hideSaleSearchResults();
    return;
  }

  const keyword = normalizeText(el.saleSearch.value);
  const editingSale = state.sales.find((sale) => sale.id === editingSaleId);
  const matches = state.products
    .filter((item) => item.stock > 0 || editingSale?.productId === item.id)
    .filter((item) => !keyword || normalizeText(item.name).includes(keyword))
    .slice(0, 8);

  if (matches.length === 0) {
    el.saleSearchResults.innerHTML = `<div class="search-empty">Không tìm thấy sản phẩm còn hàng.</div>`;
    return;
  }

  el.saleSearchResults.innerHTML = matches
    .map((item) => `
      <button class="search-result" type="button" data-product-id="${item.id}">
        <span>${escapeHtml(item.name)}</span>
        <small>${formatMoney(item.price)} · còn ${item.stock}</small>
      </button>
    `)
    .join("");

  el.saleSearchResults.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      selectSaleProduct(button.dataset.productId);
    });
    button.addEventListener("click", () => selectSaleProduct(button.dataset.productId));
  });
}

function selectSaleProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  el.saleProductId.value = product.id;
  el.saleSearch.value = product.name;
  hideSaleSearchResults();
  updateSalePreview();
  el.saleQty.focus();
}

function hideSaleSearchResults() {
  el.saleSearchResults.innerHTML = "";
  el.saleSearchResults.classList.add("hidden");
}

function updateSalePreview() {
  const product = state.products.find((item) => item.id === el.saleProductId.value);
  const qty = Math.max(1, Number(el.saleQty.value) || 1);
  const editingSale = state.sales.find((sale) => sale.id === editingSaleId);

  if (!product) {
    showSaleMessage("Gõ tên sản phẩm rồi bấm chọn trong danh sách kết quả.");
    return;
  }

  const availableStock = product.stock + (editingSale?.productId === product.id ? editingSale.qty : 0);
  const action = editingSale ? "Đang sửa đơn" : "Tạm tính";
  showSaleMessage(`${action}: ${formatMoney(product.price * qty)}. Có thể bán tối đa: ${availableStock}.`);
}

function showSaleMessage(message) {
  el.salePreview.textContent = message;
}

function renderProducts() {
  if (state.products.length === 0) {
    el.productList.innerHTML = `<div class="empty">Chưa có sản phẩm nào.</div>`;
    return;
  }

  el.productList.innerHTML = state.products
    .map((item) => {
      const warning = item.stock <= item.lowStock ? " - sắp hết" : "";
      return `
        <article class="list-item">
          <div>
            <p class="item-title">${escapeHtml(item.name)}</p>
            <p class="item-meta">${formatMoney(item.price)} · Tồn ${item.stock}${warning}</p>
          </div>
          <div class="item-actions">
            <button class="small-button" type="button" data-edit="${item.id}">Sửa</button>
            <button class="danger-button" type="button" data-delete="${item.id}">Xóa</button>
          </div>
        </article>
      `;
    })
    .join("");

  el.productList.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editProduct(button.dataset.edit));
  });

  el.productList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.delete));
  });
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  el.productId.value = product.id;
  el.productName.value = product.name;
  el.productPrice.value = product.price;
  el.productStock.value = product.stock;
  el.productLowStock.value = product.lowStock;
  el.productName.focus();
}

function deleteProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;

  const ok = confirm(`Xóa sản phẩm "${product.name}"? Lịch sử bán hàng vẫn được giữ lại.`);
  if (!ok) return;

  state.products = state.products.filter((item) => item.id !== id);
  saveState();
  render();
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
  rangeSales.forEach((sale) => {
    const current = byProduct.get(sale.productName) || { qty: 0, total: 0 };
    current.qty += sale.qty;
    current.total += sale.total;
    byProduct.set(sale.productName, current);
  });

  const rows = [...byProduct.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5);

  el.topProducts.innerHTML = rows.length
    ? rows
        .map(([name, item]) => `
          <article class="list-item">
            <div>
              <p class="item-title">${escapeHtml(name)}</p>
              <p class="item-meta">Đã bán ${item.qty} · ${formatMoney(item.total)}</p>
            </div>
          </article>
        `)
        .join("")
    : `<div class="empty">Chưa có đơn bán trong kỳ này.</div>`;
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
      return `
      <article class="list-item sale-item ${method}">
        <div>
          <p class="item-title">${escapeHtml(sale.productName)} x ${sale.qty}</p>
          <p class="item-meta">${formatDateTime(sale.createdAt)} · ${formatMoney(sale.total)} · ${paymentMethodLabel(method)}</p>
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

  const product = state.products.find((item) => item.id === sale.productId);
  if (!product) {
    alert("Sản phẩm của đơn này đã bị xóa khỏi kho, nên không thể sửa đơn.");
    return;
  }

  editingSaleId = sale.id;
  el.saleProductId.value = product.id;
  el.saleSearch.value = product.name;
  el.saleQty.value = sale.qty;
  el.salePayment.value = sale.paymentMethod || "cash";
  hideSaleSearchResults();
  el.saleSubmit.textContent = "Cập nhật đơn";
  el.cancelSaleEdit.classList.remove("hidden");
  switchTab("sell");
  updateSalePreview();
  el.saleQty.focus();
}

function deleteSale(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;

  const ok = confirm(`Xóa đơn "${sale.productName} x ${sale.qty}"? Tồn kho sẽ được cộng lại nếu sản phẩm còn trong kho.`);
  if (!ok) return;

  const product = state.products.find((item) => item.id === sale.productId);
  if (product) {
    product.stock += sale.qty;
  }

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

function sumRevenue(sales) {
  return sales.reduce((total, sale) => total + sale.total, 0);
}

function sumRevenueByPayment(sales, paymentMethod) {
  return sales
    .filter((sale) => (sale.paymentMethod || "cash") === paymentMethod)
    .reduce((total, sale) => total + sale.total, 0);
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
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

render();
