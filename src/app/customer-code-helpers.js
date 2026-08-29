const {
  buildCustomerCodeFromPrefix,
  normalizeCustomerCodePrefix
} = require('./customer-code-prefix');

function createCustomerCodeHelpers(context) {
  const ipcRenderer = context.ipcRenderer;
  const logger = context.logger || console;
  const GENERATED_CUSTOMER_CODE_WIDTH = 6;

  function normalizeCustomerName(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeCustomerCode(value) {
    const normalizedCode = String(value == null ? '' : value).trim().toUpperCase();
    return ['-', '–', '—'].includes(normalizedCode) ? '' : normalizedCode;
  }

  function normalizeBranchId(branchId) {
    const numericBranchId = Number(branchId);
    return Number.isFinite(numericBranchId) && numericBranchId > 0 ? numericBranchId : null;
  }

  async function resolveBranchCodePrefix(branchId) {
    const normalizedBranchId = normalizeBranchId(branchId);
    if (!normalizedBranchId) {
      return 'C0';
    }

    try {
      const branch = await ipcRenderer.invoke(
        'db-get',
        'SELECT customer_code_prefix FROM branches WHERE id = ? LIMIT 1',
        [normalizedBranchId]
      );
      const configuredPrefix = normalizeCustomerCodePrefix(branch?.customer_code_prefix);
      if (configuredPrefix) {
        return configuredPrefix;
      }

      const orderedBranches = await ipcRenderer.invoke(
        'db-query',
        'SELECT id FROM branches ORDER BY id',
        []
      );
      const branchIndex = Array.isArray(orderedBranches)
        ? orderedBranches.findIndex((branch) => Number(branch?.id) === normalizedBranchId)
        : -1;
      if (branchIndex >= 0) {
        return `C${branchIndex + 1}`;
      }

      return `C${normalizedBranchId}`;
    } catch (error) {
      logger.error('Error resolving branch customer code prefix:', error);
      return `C${normalizedBranchId}`;
    }
  }

  function buildGeneratedCustomerCode(branchPrefix, sequence = 1) {
    return buildCustomerCodeFromPrefix(branchPrefix, sequence, GENERATED_CUSTOMER_CODE_WIDTH);
  }

  async function getNextGeneratedCustomerSequence(branchId) {
    const branchPrefix = await resolveBranchCodePrefix(branchId);
    const prefix = `${branchPrefix}-`;
    const codePattern = `${prefix}${'[0-9]'.repeat(GENERATED_CUSTOMER_CODE_WIDTH)}`;

    try {
      const row = await ipcRenderer.invoke(
        'db-get',
        `
          SELECT MAX(CAST(SUBSTR(UPPER(TRIM(COALESCE(customer_code, ''))), ?, ?) AS INTEGER)) AS max_sequence
          FROM customers
          WHERE UPPER(TRIM(COALESCE(customer_code, ''))) GLOB ?
        `,
        [prefix.length + 1, GENERATED_CUSTOMER_CODE_WIDTH, codePattern]
      );

      const maxSequence = Number(row?.max_sequence || 0);
      return Number.isFinite(maxSequence) && maxSequence > 0 ? maxSequence + 1 : 1;
    } catch (error) {
      logger.error('Error reading next generated customer sequence:', error);
      return 1;
    }
  }

  async function generateUniqueCustomerCode(branchId) {
    const branchPrefix = await resolveBranchCodePrefix(branchId);
    let nextSequence = await getNextGeneratedCustomerSequence(branchId);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidateCode = buildGeneratedCustomerCode(branchPrefix, nextSequence + attempt);
      const existing = await findCustomerByCode(candidateCode);
      if (!existing) {
        return candidateCode;
      }
    }

    throw new Error('customer_code_generation_failed');
  }

  async function findCustomerByCode(customerCode) {
    const normalizedCode = normalizeCustomerCode(customerCode);
    if (!normalizedCode) {
      return null;
    }

    try {
      const row = await ipcRenderer.invoke(
        'db-get',
        `
          SELECT id, customer_name, customer_code, branch_id
          FROM customers
          WHERE UPPER(TRIM(COALESCE(customer_code, ''))) = ?
          LIMIT 1
        `,
        [normalizedCode]
      );

      if (!row) {
        return null;
      }

      return {
        id: Number(row.id || 0),
        customer_name: normalizeCustomerName(row.customer_name),
        branch_id: normalizeBranchId(row.branch_id),
        customer_code: normalizeCustomerCode(row.customer_code)
      };
    } catch (error) {
      logger.error('Error finding customer by code:', error);
      return null;
    }
  }

  async function findCustomersByName(customerName, branchId = null) {
    const normalizedName = normalizeCustomerName(customerName);
    if (!normalizedName) {
      return [];
    }

    const normalizedBranchId = normalizeBranchId(branchId);
    const branchFilterSql = normalizedBranchId ? 'AND COALESCE(branch_id, 0) = ?' : '';
    const params = normalizedBranchId ? [normalizedName, normalizedBranchId] : [normalizedName];

    try {
      const rows = await ipcRenderer.invoke(
        'db-query',
        `
          SELECT id, customer_name, customer_code, branch_id
          FROM customers
          WHERE TRIM(COALESCE(customer_name, '')) = ?
          ${branchFilterSql}
          ORDER BY id ASC
        `,
        params
      );

      return Array.isArray(rows)
        ? rows.map((row) => ({
          id: Number(row.id || 0),
          customer_name: normalizeCustomerName(row.customer_name),
          customer_code: normalizeCustomerCode(row.customer_code),
          branch_id: normalizeBranchId(row.branch_id)
        }))
        : [];
    } catch (error) {
      logger.error('Error finding customers by name:', error);
      return [];
    }
  }

  async function createCustomerRecord({ customerName, customerCode, branchId = null }) {
    const normalizedName = normalizeCustomerName(customerName);
    const normalizedCode = normalizeCustomerCode(customerCode);
    const normalizedBranchId = normalizeBranchId(branchId);
    const effectiveCode = normalizedCode || await generateUniqueCustomerCode(normalizedBranchId);

    const result = await ipcRenderer.invoke(
      'db-run',
      `
        INSERT INTO customers (customer_code, customer_name, branch_id, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [effectiveCode, normalizedName, normalizedBranchId]
    );

    return {
      id: Number(result?.lastInsertRowid || 0),
      customer_name: normalizedName,
      customer_code: effectiveCode,
      branch_id: normalizedBranchId
    };
  }

  async function ensureCustomerHasCode(customer, branchId = null) {
    const existingCode = normalizeCustomerCode(customer?.customer_code);
    if (existingCode) {
      return {
        ...customer,
        customer_code: existingCode
      };
    }

    const customerId = Number(customer?.id || 0);
    if (!customerId) {
      return customer;
    }

    const normalizedBranchId = normalizeBranchId(branchId) || normalizeBranchId(customer?.branch_id);
    const generatedCode = await generateUniqueCustomerCode(normalizedBranchId);
    await ipcRenderer.invoke(
      'db-run',
      `
        UPDATE customers
        SET customer_code = ?,
            branch_id = COALESCE(branch_id, ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [generatedCode, normalizedBranchId, customerId]
    );

    return {
      ...customer,
      customer_code: generatedCode,
      branch_id: normalizedBranchId
    };
  }

  async function suggestCustomerCodeForName(customerName, branchId = null) {
    const matches = await findCustomersByName(customerName, branchId);
    return matches.length === 1 ? matches[0].customer_code : '';
  }

  async function resolveCustomerIdentity({ customerName, customerCode, branchId }) {
    const normalizedName = normalizeCustomerName(customerName);
    if (!normalizedName) {
      throw new Error('customer_name_required');
    }

    const normalizedCode = normalizeCustomerCode(customerCode);
    const normalizedBranchId = normalizeBranchId(branchId);

    if (normalizedCode) {
      const existingCustomer = await findCustomerByCode(normalizedCode);
      if (existingCustomer) {
        const existingName = normalizeCustomerName(existingCustomer.customer_name);
        const sameName = existingName === normalizedName;
        const sameBranch = normalizedBranchId == null
          || existingCustomer.branch_id == null
          || existingCustomer.branch_id === normalizedBranchId;

        if (!sameName) {
          throw new Error(`customer_code_name_conflict:${existingName}`);
        }

        if (!sameBranch) {
          throw new Error('customer_code_branch_conflict');
        }

        return {
          customer_id: Number(existingCustomer.id || 0),
          customer_name: existingName,
          customer_code: existingCustomer.customer_code,
          branch_id: existingCustomer.branch_id
        };
      }

      const createdCustomer = await createCustomerRecord({
        customerName: normalizedName,
        customerCode: normalizedCode,
        branchId: normalizedBranchId
      });

      return {
        customer_id: createdCustomer.id,
        customer_name: createdCustomer.customer_name,
        customer_code: createdCustomer.customer_code,
        branch_id: createdCustomer.branch_id
      };
    }

    const matchingCustomers = await findCustomersByName(normalizedName, normalizedBranchId);
    if (matchingCustomers.length === 1) {
      const customerWithCode = await ensureCustomerHasCode(matchingCustomers[0], normalizedBranchId);
      return {
        customer_id: Number(customerWithCode.id || 0),
        customer_name: customerWithCode.customer_name,
        customer_code: customerWithCode.customer_code,
        branch_id: customerWithCode.branch_id
      };
    }

    if (matchingCustomers.length > 1) {
      throw new Error('customer_code_required_for_duplicate_name');
    }

    const createdCustomer = await createCustomerRecord({
      customerName: normalizedName,
      customerCode: await generateUniqueCustomerCode(normalizedBranchId),
      branchId: normalizedBranchId
    });

    return {
      customer_id: createdCustomer.id,
      customer_name: createdCustomer.customer_name,
      customer_code: createdCustomer.customer_code,
      branch_id: createdCustomer.branch_id
    };
  }

  return {
    normalizeCustomerName,
    normalizeCustomerCode,
    suggestCustomerCodeForName,
    resolveCustomerIdentity
  };
}

module.exports = {
  createCustomerCodeHelpers
};
