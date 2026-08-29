function createCustomerCodeAutoFill(deps) {
  const doc = deps.document;
  const logger = deps.logger || console;
  const suggestCustomerCodeForName = typeof deps.suggestCustomerCodeForName === 'function'
    ? deps.suggestCustomerCodeForName
    : async () => '';
  const resolveBranchId = typeof deps.resolveBranchId === 'function'
    ? deps.resolveBranchId
    : async () => null;
  const loadCustomersForDropdowns = typeof deps.loadCustomersForDropdowns === 'function'
    ? deps.loadCustomersForDropdowns
    : null;
  const pendingTokens = new WeakMap();
  const loadTokens = new WeakMap();
  const activeIndexes = new WeakMap();
  const dropdowns = new WeakMap();
  const sourceListIds = new WeakMap();

  function normalizeName(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeCode(value) {
    const normalizedCode = String(value == null ? '' : value).trim().toUpperCase();
    return ['-', '–', '—'].includes(normalizedCode) ? '' : normalizedCode;
  }

  function getDatalistOptions(nameInput) {
    const listId = sourceListIds.get(nameInput) || (nameInput && typeof nameInput.getAttribute === 'function'
      ? nameInput.getAttribute('list')
      : '');
    const datalist = listId && doc && typeof doc.getElementById === 'function'
      ? doc.getElementById(listId)
      : '';
    return datalist && datalist.children ? Array.from(datalist.children) : [];
  }

  function getDropdown(nameInput) {
    if (!nameInput) return null;

    let dropdown = dropdowns.get(nameInput);
    if (dropdown) return dropdown;

    const host = nameInput.parentElement;
    if (!host || typeof doc?.createElement !== 'function') return null;

    host.classList?.add?.('customer-choice-host');
    dropdown = doc.createElement('div');
    dropdown.className = 'customer-choice-list d-none';
    dropdown.setAttribute?.('role', 'listbox');
    dropdown.setAttribute?.('aria-label', 'قائمة العملاء');
    host.appendChild(dropdown);
    dropdowns.set(nameInput, dropdown);
    return dropdown;
  }

  function readOptionCustomer(option) {
    const dataset = option?.dataset || {};
    return {
      name: normalizeName(dataset.customerName || option?.getAttribute?.('data-customer-name') || option?.value),
      code: normalizeCode(dataset.customerCode || option?.getAttribute?.('data-customer-code') || '')
    };
  }

  function getUniqueCustomers(nameInput) {
    const seen = new Set();
    return getDatalistOptions(nameInput)
      .map(readOptionCustomer)
      .filter((customer) => {
        if (!customer.name) return false;
        const key = `${customer.name}|${customer.code}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function filterCustomersForInput(nameInput) {
    const query = normalizeName(nameInput?.value).toUpperCase();
    const customers = getUniqueCustomers(nameInput);
    if (!query) {
      return customers.slice(0, 80);
    }

    return customers
      .filter((customer) => `${customer.name} ${customer.code}`.toUpperCase().includes(query))
      .slice(0, 80);
  }

  function resolveSelectedCustomerFromDatalist(nameInput) {
    const rawValue = normalizeName(nameInput?.value);
    if (!rawValue) {
      return { name: '', code: '' };
    }

    const options = getDatalistOptions(nameInput);
    const selectedOption = options.find((option) => normalizeName(option.value) === rawValue);
    if (selectedOption) {
      return readOptionCustomer(selectedOption);
    }

    const matchingByName = options
      .map(readOptionCustomer)
      .filter((customer) => customer.name === rawValue && customer.code);
    const uniqueCodes = Array.from(new Set(matchingByName.map((customer) => customer.code)));
    return uniqueCodes.length === 1
      ? { name: rawValue, code: uniqueCodes[0] }
      : { name: rawValue, code: '' };
  }

  function prepareCodeInput(codeInput) {
    if (!codeInput) return;
    codeInput.readOnly = true;
    codeInput.setAttribute?.('readonly', 'readonly');
    codeInput.setAttribute?.('aria-readonly', 'true');
    codeInput.setAttribute?.('autocomplete', 'off');
    codeInput.classList?.add?.('customer-code-readonly');
  }

  function setCodeValue(codeInput, code) {
    if (!codeInput) return;
    const normalizedCode = normalizeCode(code);
    codeInput.value = normalizedCode;
    codeInput.placeholder = normalizedCode
      ? 'كود العميل المحدد'
      : 'يتولد تلقائياً عند إضافة عميل جديد';
  }

  function hideDropdown(nameInput) {
    const dropdown = dropdowns.get(nameInput);
    if (dropdown) {
      dropdown.classList?.add?.('d-none');
      dropdown.innerHTML = '';
    }
    activeIndexes.delete(nameInput);
  }

  function showDropdownMessage(nameInput, message) {
    const dropdown = getDropdown(nameInput);
    if (!dropdown) return;

    dropdown.innerHTML = '';
    const item = doc.createElement('div');
    item.className = 'customer-choice-empty';
    item.textContent = message;
    dropdown.appendChild(item);
    dropdown.classList?.remove?.('d-none');
    activeIndexes.delete(nameInput);
  }

  async function loadOptionsForPair(pair, { showLoading = false } = {}) {
    const nameInput = doc?.getElementById?.(pair.nameInputId);
    if (!nameInput) return false;

    const loadOptions = typeof pair.loadOptions === 'function'
      ? pair.loadOptions
      : loadCustomersForDropdowns;
    if (typeof loadOptions !== 'function') {
      return true;
    }

    const branchId = await resolveBranchId();
    if (!branchId) {
      showDropdownMessage(nameInput, 'اختر الفرع أولاً');
      return false;
    }

    const token = {};
    loadTokens.set(nameInput, token);
    if (showLoading) {
      showDropdownMessage(nameInput, 'جاري تحميل عملاء الفرع...');
    }

    try {
      await loadOptions(branchId);
      if (loadTokens.get(nameInput) !== token) {
        return false;
      }
      loadTokens.delete(nameInput);
      return true;
    } catch (error) {
      logger.error('Error loading customer options:', error);
      if (loadTokens.get(nameInput) === token) {
        loadTokens.delete(nameInput);
        showDropdownMessage(nameInput, 'تعذر تحميل عملاء الفرع');
      }
      return false;
    }
  }

  function selectCustomer(pair, customer) {
    const nameInput = doc?.getElementById?.(pair.nameInputId);
    const codeInput = doc?.getElementById?.(pair.codeInputId);
    if (!nameInput || !codeInput || !customer?.name) return;

    nameInput.value = customer.name;
    setCodeValue(codeInput, customer.code);
    hideDropdown(nameInput);
    if (typeof nameInput.dispatchEvent === 'function' && typeof Event === 'function') {
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function updateActiveOption(nameInput, dropdown, nextIndex) {
    const items = dropdown ? Array.from(dropdown.querySelectorAll?.('.customer-choice-item') || []) : [];
    if (!items.length) {
      activeIndexes.delete(nameInput);
      return;
    }

    const normalizedIndex = Math.max(0, Math.min(nextIndex, items.length - 1));
    activeIndexes.set(nameInput, normalizedIndex);
    items.forEach((item, index) => {
      item.classList?.toggle?.('is-active', index === normalizedIndex);
    });
  }

  function showDropdown(pair) {
    const nameInput = doc?.getElementById?.(pair.nameInputId);
    if (!nameInput) return;

    const dropdown = getDropdown(nameInput);
    if (!dropdown) return;

    const customers = filterCustomersForInput(nameInput);
    dropdown.innerHTML = '';

    if (customers.length === 0) {
      const hasQuery = normalizeName(nameInput.value).length > 0;
      const emptyItem = doc.createElement('div');
      emptyItem.className = 'customer-choice-empty';
      emptyItem.textContent = hasQuery
        ? 'لا توجد عملاء مطابقة في الفرع الحالي'
        : 'لا توجد عملاء في الفرع الحالي';
      dropdown.appendChild(emptyItem);
      dropdown.classList?.remove?.('d-none');
      activeIndexes.delete(nameInput);
      return;
    }

    customers.forEach((customer, index) => {
      const item = doc.createElement('button');
      item.type = 'button';
      item.className = 'customer-choice-item';
      item.setAttribute?.('role', 'option');
      item.innerHTML = `
        <span class="customer-choice-name">${escapeHtml(customer.name)}</span>
        ${customer.code ? `<span class="customer-choice-code">${escapeHtml(customer.code)}</span>` : ''}
      `;
      item.addEventListener?.('mousedown', (event) => {
        event.preventDefault();
      });
      item.addEventListener?.('click', () => {
        selectCustomer(pair, customer);
      });
      dropdown.appendChild(item);

      if (index === 0) {
        item.classList?.add?.('is-active');
      }
    });

    activeIndexes.set(nameInput, 0);
    dropdown.classList?.remove?.('d-none');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function refreshPair(pair) {
    const nameInput = doc?.getElementById?.(pair.nameInputId);
    const codeInput = doc?.getElementById?.(pair.codeInputId);
    if (!nameInput || !codeInput) return;

    prepareCodeInput(codeInput);

    const selectedCustomer = resolveSelectedCustomerFromDatalist(nameInput);
    if (selectedCustomer.name && selectedCustomer.name !== normalizeName(nameInput.value)) {
      nameInput.value = selectedCustomer.name;
    }

    if (!selectedCustomer.name) {
      pendingTokens.delete(nameInput);
      setCodeValue(codeInput, '');
      return;
    }

    if (selectedCustomer.code) {
      pendingTokens.delete(nameInput);
      setCodeValue(codeInput, selectedCustomer.code);
      return;
    }

    const token = {};
    pendingTokens.set(nameInput, token);
    setCodeValue(codeInput, '');

    try {
      const branchId = await resolveBranchId();
      const suggestedCode = await suggestCustomerCodeForName(selectedCustomer.name, branchId);
      if (pendingTokens.get(nameInput) !== token) {
        return;
      }
      setCodeValue(codeInput, suggestedCode);
    } catch (error) {
      logger.error('Error auto-filling customer code:', error);
      if (pendingTokens.get(nameInput) === token) {
        setCodeValue(codeInput, '');
      }
    }
  }

  function bindPair(pair) {
    const nameInput = doc?.getElementById?.(pair.nameInputId);
    const codeInput = doc?.getElementById?.(pair.codeInputId);
    if (!nameInput || !codeInput) return;

    const nativeListId = typeof nameInput.getAttribute === 'function'
      ? nameInput.getAttribute('list')
      : '';
    if (nativeListId) {
      sourceListIds.set(nameInput, nativeListId);
      nameInput.setAttribute?.('data-customer-list-source', nativeListId);
      nameInput.removeAttribute?.('list');
    }
    nameInput.setAttribute?.('autocomplete', 'off');

    prepareCodeInput(codeInput);
    setCodeValue(codeInput, codeInput.value);

    const refresh = () => {
      refreshPair(pair);
      showDropdown(pair);
      if (getUniqueCustomers(nameInput).length === 0) {
        loadOptionsForPair(pair).then((loaded) => {
          if (loaded && (!doc?.activeElement || doc.activeElement === nameInput)) {
            showDropdown(pair);
          }
        });
      }
    };

    if (typeof nameInput.addEventListener === 'function') {
      nameInput.addEventListener('input', refresh);
      nameInput.addEventListener('change', refresh);
      nameInput.addEventListener('blur', () => {
        refreshPair(pair);
        setTimeout(() => hideDropdown(nameInput), 120);
      });
      nameInput.addEventListener('focus', () => {
        loadOptionsForPair(pair, { showLoading: true }).then((loaded) => {
          if (loaded && (!doc?.activeElement || doc.activeElement === nameInput)) {
            showDropdown(pair);
          }
        });
      });
      nameInput.addEventListener('keydown', (event) => {
        const dropdown = dropdowns.get(nameInput);
        if (!dropdown || dropdown.classList?.contains?.('d-none')) return;

        const customers = filterCustomersForInput(nameInput);
        if (!customers.length) return;

        const currentIndex = activeIndexes.get(nameInput) ?? 0;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          updateActiveOption(nameInput, dropdown, currentIndex + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          updateActiveOption(nameInput, dropdown, currentIndex - 1);
        } else if (event.key === 'Enter' && activeIndexes.has(nameInput)) {
          event.preventDefault();
          selectCustomer(pair, customers[activeIndexes.get(nameInput)]);
        } else if (event.key === 'Escape') {
          hideDropdown(nameInput);
        }
      });
    }

    const listId = sourceListIds.get(nameInput) || (typeof nameInput.getAttribute === 'function' ? nameInput.getAttribute('list') : '');
    const datalist = listId && doc?.getElementById?.(listId);
    const MutationObserverCtor = globalThis.MutationObserver;
    if (datalist && typeof MutationObserverCtor === 'function') {
      const observer = new MutationObserverCtor(() => {
        if (doc?.activeElement === nameInput) {
          showDropdown(pair);
        }
      });
      observer.observe(datalist, { childList: true });
    }

    doc?.addEventListener?.('mousedown', (event) => {
      const dropdown = dropdowns.get(nameInput);
      if (!dropdown) return;
      if (event.target === nameInput || dropdown.contains?.(event.target)) return;
      hideDropdown(nameInput);
    });
  }

  function bindPairs(pairs) {
    (Array.isArray(pairs) ? pairs : []).forEach(bindPair);
  }

  return {
    bindPair,
    bindPairs,
    refreshPair
  };
}

module.exports = {
  createCustomerCodeAutoFill
};
