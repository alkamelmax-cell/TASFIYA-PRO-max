# Tasfiya Pro (تصفية برو) AI Assistant Instructions

## Project Overview
Tasfiya Pro is a professional cashier reconciliation system built with Electron, focusing on Arabic language support and RTL layouts. The system manages reconciliations between system sales and actual receipts, tracking bank transactions, cash receipts, postpaid sales, and customer payments.

## Key Technologies
- **Frontend**: Electron, HTML5, CSS3, JavaScript (ES6+)
- **Database**: SQLite (better-sqlite3) with structured schema
- **Dependencies**: Bootstrap 5, Puppeteer (PDF generation)
- **Development**: Node.js 16+, npm 8+
- **Target Platform**: Windows 10/11

## Architecture

### Core Components
1. **Main Process** (`src/main.js`):
   - App lifecycle management
   - Database connections
   - Window management
   - IPC handlers for database operations
   - Print/PDF generation services

2. **Renderer Process** (`src/app.js`):
   - UI event handling
   - Reconciliation management
   - Real-time calculations
   - Data validation
   - AutoComplete system

3. **Database Layer** (`src/database.js`):
   - SQLite schema management
   - Transaction handling
   - Data access patterns
   - Auto-backup system

### Key Data Flow Patterns
1. **Reconciliation Creation Flow**:
   ```javascript
   // 1. Create new reconciliation record
   INSERT INTO reconciliations (cashier_id, accountant_id, reconciliation_date)
   // 2. Add transactions (bank, cash, postpaid, etc.)
   INSERT INTO bank_receipts/cash_receipts/postpaid_sales
   // 3. Complete reconciliation with final calculations
   UPDATE reconciliations SET status = 'completed', reconciliation_number = ?
   ```

2. **Transaction Management**:
   - All monetary operations use DECIMAL(10,2)
   - Transactions are contained within reconciliation scope
   - Foreign key constraints ensure data integrity

## Critical Patterns

### 1. Error Handling
Always use structured error handling with Arabic user messages:
```javascript
try {
  await operation()
} catch (error) {
  console.error('❌ [CONTEXT] Error:', error);
  DialogUtils.showError('رسالة الخطأ بالعربية');
}
```

### 2. Data Validation
Validate all monetary inputs:
```javascript
if (!amount || amount <= 0) {
  DialogUtils.showValidationError('يرجى إدخال مبلغ صحيح');
  return;
}
```

### 3. UI Updates
Always update all related displays after data changes:
```javascript
updateXTable();    // Update specific table
updateSummary();   // Recalculate totals
updateButtonStates(); // Update UI state
```

### 4. Database Operations
Use prepared statements and transactions:
```javascript
const result = await dbManager.run(
  'INSERT INTO table (col1, col2) VALUES (?, ?)',
  [value1, value2]
);
```

## Common Tasks

### Adding New Receipt Types
1. Create database table in `database.js`
2. Add UI components in `index.html`
3. Implement handlers in `app.js`
4. Update summary calculations
5. Add to print template

### Modifying Reconciliation Logic
1. Update calculations in `updateSummary()`
2. Modify database schema if needed
3. Update print templates
4. Add migration code in `updateDatabaseSchema()`

## Project Conventions

### File Organization
- `src/`: Core application code
- `assets/`: Static resources
- `scripts/`: Build and utility scripts
- `templates/`: Print/PDF templates

### Naming Conventions
- Database tables: Plural nouns (e.g., `reconciliations`, `bank_receipts`)
- UI components: `<purpose>Section` (e.g., `bankReceiptsSection`)
- Event handlers: `handle<Event>` (e.g., `handleBankReceipt`)
- Update functions: `update<Component>` (e.g., `updateSummary`)

### RTL/Arabic Support
- Use RTL-aware layouts with `dir="rtl"`
- Arabic text in all user interfaces
- Numbers displayed in English format
- Dates in Gregorian calendar only

## Common Gotchas
1. **Database Updates**: Always use transactions for multi-table operations
2. **Print Templates**: Generate in both color and B/W modes
3. **Date Handling**: Store in ISO format, display in local format
4. **Number Formatting**: Use English numerals with Arabic labels
5. **Window Management**: Handle multiple windows correctly in Electron

## Development Workflow
1. Use `npm run dev` for development with hot reload
2. Test thoroughly with Arabic data
3. Validate print outputs in both color/B&W
4. Check RTL layout in all screens
5. Verify calculations match business rules

## Testing Rules
1. Test with various Arabic names/text
2. Verify all currency calculations
3. Check print layout in all formats
4. Validate database constraints
5. Test backup/restore functionality

## Telemetry
Log critical operations with Arabic context:
```javascript
console.log('📝 [CONTEXT] Operation details:', {
  data: value,
  result: outcome
});
```

## Additional Resources
- DB Schema: See `src/database.js`
- UI Components: See `index.html`
- Print Templates: See print generation functions in `main.js`
- API Documentation: Available in source file headers