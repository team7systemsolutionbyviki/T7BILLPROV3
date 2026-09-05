// T7 BillPro - Core Logic

// Storage Interceptors for Multi-Branch (Defined FIRST before any storage access)
let cashTransactions = [];
let cashOpenings = {};

let currentBranchId = sessionStorage.getItem('mediflow_current_branch') || 'branch_default';
const branchSpecificKeys = ['mediflow_products', 'mediflow_sales', 'mediflow_settings', 'mediflow_purchases', 'mediflow_expenses', 'mediflow_categories', 'mediflow_expense_categories', 'mediflow_customers', 'mediflow_customer_payments', 'mediflow_suppliers', 'mediflow_supplier_payments', 'mediflow_held_carts', 'mediflow_amc', 'mediflow_staff', 'mediflow_attendance', 'mediflow_staff_advances', 'mediflow_salary_payments', 'mediflow_digital_orders', 'mediflow_doctors', 'mediflow_tables', 'mediflow_stock_in_logs', 'mediflow_cake_flavors', 'mediflow_cancelled_digital_orders', 'mediflow_cash_transactions', 'mediflow_cash_openings'];

function isValidCategoryName(catName) {
    if (!catName) return false;
    const str = String(catName).trim();
    if (!str || str === 'undefined' || str === 'null') return false;
    if (str.length > 60) return false;
    
    if (str.includes('[Content_Types]') || str.includes('worksheets/') || str.includes('sheet1.xml') || str.includes('theme/theme') || str.includes('docProps/') || str.includes('xl/')) {
        return false;
    }
    if (str.includes('<xml') || str.includes('<?xml') || str.includes('</') || str.startsWith('PK\x03\x04') || str.includes('PK!')) {
        return false;
    }
    if (/[\x00-\x1F\x7F-\x9F\uFFFD]/.test(str)) {
        return false;
    }
    const nonAsciiOrSymbolCount = (str.match(/[^a-zA-Z0-9\s\-_&/().,+]/g) || []).length;
    if (nonAsciiOrSymbolCount > 3 && nonAsciiOrSymbolCount / str.length > 0.3) {
        return false;
    }
    return true;
}
window.isValidCategoryName = isValidCategoryName;

const originalGetItem = localStorage.getItem;
const originalSetItem = localStorage.setItem;
const originalRemoveItem = localStorage.removeItem;

localStorage.getItem = function(key) {
    if (branchSpecificKeys.includes(key) && typeof currentBranchId !== 'undefined' && currentBranchId) {
        return originalGetItem.apply(this, [`mediflow_${currentBranchId}_${key.replace('mediflow_', '')}`]);
    }
    return originalGetItem.apply(this, [key]);
};

// --- Offline QR Code Helper ---
window.generateOfflineQRCode = function(text, size = 250) {
    try {
        if (typeof QRCode === 'undefined') return '';
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.left = '-9999px';
        div.style.top = '-9999px';
        document.body.appendChild(div);
        
        new QRCode(div, {
            text: String(text),
            width: size,
            height: size,
            correctLevel: QRCode.CorrectLevel.L
        });
        
        let result = '';
        const canvas = div.querySelector('canvas');
        if (canvas) {
            result = canvas.toDataURL('image/png');
        } else {
            const img = div.querySelector('img');
            if (img && img.src) result = img.src;
        }
        
        document.body.removeChild(div);
        return result;
    } catch (e) {
        console.error("QR Code Generation failed:", e);
        return '';
    }
};

localStorage.setItem = function(key, value) {
    let actualKey = key;
    if (branchSpecificKeys.includes(key) && typeof currentBranchId !== 'undefined' && currentBranchId) {
        actualKey = `mediflow_${currentBranchId}_${key.replace('mediflow_', '')}`;
    }
    // 1. Save to active branch key
    originalSetItem.apply(this, [actualKey, value]);

    // 2. Dual-save to local un-prefixed set path key as local backup
    const cleanKey = key.startsWith('mediflow_') ? key : `mediflow_${key}`;
    if (actualKey !== cleanKey) {
        originalSetItem.apply(this, [cleanKey, value]);
    }

    // 3. Sync EACH AND EVERY data store to Firebase Cloud if Firebase is active
    if (typeof isSyncingFromCloud !== 'undefined' && !isSyncingFromCloud && typeof isFirebaseEnabled !== 'undefined' && isFirebaseEnabled && typeof db !== 'undefined' && db) {
        const keyMap = {
            'mediflow_products': 'products',
            'mediflow_sales': 'sales',
            'mediflow_settings': 'settings',
            'mediflow_purchases': 'purchases',
            'mediflow_expenses': 'expenses',
            'mediflow_categories': 'categories',
            'mediflow_expense_categories': 'expense_categories',
            'mediflow_customers': 'customers',
            'mediflow_suppliers': 'suppliers',
            'mediflow_admins': 'admins',
            'mediflow_supplier_payments': 'supplier_payments',
            'mediflow_customer_payments': 'customer_payments',
            'mediflow_branches': 'branches',
            'mediflow_digital_orders': 'digital_orders',
            'mediflow_doctors': 'doctors',
            'mediflow_staff': 'staff',
            'mediflow_attendance': 'attendance',
            'mediflow_staff_advances': 'staff_advances',
            'mediflow_salary_payments': 'salary_payments',
            'mediflow_held_carts': 'held_carts',
            'mediflow_amc': 'amc',
            'mediflow_tables': 'tables',
            'mediflow_cake_flavors': 'cake_flavors',
            'mediflow_cancelled_digital_orders': 'cancelled_digital_orders',
            'mediflow_cash_transactions': 'cash_transactions',
            'mediflow_cash_openings': 'cash_openings',
            'mediflow_branch_settings_permissions': 'branch_settings_permissions'
        };

        const targetCol = keyMap[cleanKey] || keyMap[key];
        if (targetCol) {
             try {
                 const objectCols = ['settings', 'amc', 'branch_settings_permissions', 'cash_openings'];
                 const payload = objectCols.includes(targetCol) ? JSON.parse(value) : { data: JSON.parse(value) };
                 if (typeof syncToCloud === 'function') syncToCloud(targetCol, payload);
             } catch(e) {
                 console.error("Auto-backup parse error for " + key, e);
             }
        }
    }
};

localStorage.removeItem = function(key) {
    if (branchSpecificKeys.includes(key) && typeof currentBranchId !== 'undefined' && currentBranchId) {
        let branchKey = `mediflow_${currentBranchId}_${key.replace('mediflow_', '')}`;
        originalRemoveItem.apply(this, [branchKey]);
    }
    return originalRemoveItem.apply(this, [key]);
};

// Robust Helper to Retrieve Legacy / Non-Prefixed Storage Data
function getLegacyOrBranchData(key) {
    // 1. Try standard storage (intercepted for current branch)
    let val = localStorage.getItem(key);
    if (val !== null) {
        try {
            let parsed = JSON.parse(val);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0) return parsed;
        } catch (e) {}
    }

    // 2. Try raw original un-intercepted key
    let rawVal = originalGetItem.call(localStorage, key);
    if (rawVal !== null) {
        try {
            let parsed = JSON.parse(rawVal);
            if (parsed && ((Array.isArray(parsed) && parsed.length > 0) || (typeof parsed === 'object' && Object.keys(parsed).length > 0))) {
                localStorage.setItem(key, rawVal);
                return parsed;
            }
        } catch (e) {}
    }

    // 3. Try fallback branch_default key
    let defaultKey = `mediflow_branch_default_${key.replace('mediflow_', '')}`;
    let defaultVal = originalGetItem.call(localStorage, defaultKey);
    if (defaultVal !== null) {
        try {
            let parsed = JSON.parse(defaultVal);
            if (parsed && ((Array.isArray(parsed) && parsed.length > 0) || (typeof parsed === 'object' && Object.keys(parsed).length > 0))) {
                localStorage.setItem(key, defaultVal);
                return parsed;
            }
        } catch (e) {}
    }

    // 4. Try bare key (without mediflow_ prefix)
    let bareKey = key.replace('mediflow_', '');
    let bareVal = originalGetItem.call(localStorage, bareKey);
    if (bareVal !== null) {
        try {
            let parsed = JSON.parse(bareVal);
            if (parsed && ((Array.isArray(parsed) && parsed.length > 0) || (typeof parsed === 'object' && Object.keys(parsed).length > 0))) {
                localStorage.setItem(key, bareVal);
                return parsed;
            }
        } catch (e) {}
    }

    // Fallback if val was empty array/object
    if (val !== null) {
        try { return JSON.parse(val); } catch (e) {}
    }
    return null;
}

// Auto-reconstruct missing products from Sales & Purchases History
function recoverProductsFromSales(currentProducts, currentSales, currentPurchases) {
    let prodList = Array.isArray(currentProducts) ? [...currentProducts] : [];
    const prodMap = new Map();

    prodList.forEach(p => {
        if (p && p.id) prodMap.set(String(p.id).toLowerCase(), p);
        if (p && p.name) prodMap.set(String(p.name).trim().toLowerCase(), p);
    });

    let recoveredCount = 0;

    // Recover from Sales
    if (Array.isArray(currentSales)) {
        currentSales.forEach(sale => {
            if (sale && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    if (!item || !item.name) return;
                    const keyId = item.id ? String(item.id).toLowerCase() : null;
                    const keyName = String(item.name).trim().toLowerCase();

                    if ((!keyId || !prodMap.has(keyId)) && !prodMap.has(keyName)) {
                        const newProd = {
                            id: item.id || ('P_REC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                            name: item.name,
                            barcode: item.barcode || item.code || '',
                            category: item.category || 'General',
                            unit: item.unit || 'pcs',
                            hsn: item.hsn || '',
                            batch: item.batch || '',
                            expiry: item.expiry || '',
                            mrp: item.mrp || item.salePrice || item.price || 0,
                            salePrice: item.salePrice || item.price || 0,
                            stock: 100,
                            purchasePrice: item.purchasePrice || 0,
                            gst: item.gst || 0
                        };
                        prodList.push(newProd);
                        if (newProd.id) prodMap.set(String(newProd.id).toLowerCase(), newProd);
                        prodMap.set(keyName, newProd);
                        recoveredCount++;
                    }
                });
            }
        });
    }

    // Recover from Purchases
    if (Array.isArray(currentPurchases)) {
        currentPurchases.forEach(pur => {
            if (pur && Array.isArray(pur.items)) {
                pur.items.forEach(item => {
                    if (!item || !item.name) return;
                    const keyId = item.id ? String(item.id).toLowerCase() : null;
                    const keyName = String(item.name).trim().toLowerCase();

                    if ((!keyId || !prodMap.has(keyId)) && !prodMap.has(keyName)) {
                        const newProd = {
                            id: item.id || ('P_REC_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                            name: item.name,
                            barcode: item.barcode || item.code || '',
                            category: item.category || 'General',
                            unit: item.unit || 'pcs',
                            hsn: item.hsn || '',
                            batch: item.batch || '',
                            expiry: item.expiry || '',
                            mrp: item.mrp || item.salePrice || item.price || 0,
                            salePrice: item.salePrice || item.price || 0,
                            stock: item.qty || 100,
                            purchasePrice: item.purchasePrice || item.price || 0,
                            gst: item.gst || 0
                        };
                        prodList.push(newProd);
                        if (newProd.id) prodMap.set(String(newProd.id).toLowerCase(), newProd);
                        prodMap.set(keyName, newProd);
                        recoveredCount++;
                    }
                });
            }
        });
    }

    if (recoveredCount > 0) {
        console.log(`Auto-recovered ${recoveredCount} missing products from sales/purchase history.`);
    }

    return prodList;
}

// --- Constants & State ---
let branches = JSON.parse(localStorage.getItem('mediflow_branches')) || [];
let currentUser = sessionStorage.getItem('mediflow_user') || null;
let currentTheme = localStorage.getItem('mediflow_theme') || 'light';
let admins = JSON.parse(localStorage.getItem('mediflow_admins')) || [];


// --- Phase 1 Security Hardening ---
function getCurrentActor() {
    const username = (sessionStorage.getItem('mediflow_user') || '').trim();
    const role = (sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role') || '').trim();
    const branchId = sessionStorage.getItem('mediflow_current_branch') || currentBranchId || 'branch_default';
    return { username: username || 'unknown', role: role || 'unknown', branchId };
}

function isSuperAdminSession() {
    const actor = getCurrentActor();
    return actor.username.toLowerCase() === 'viki' ||
        actor.username.toLowerCase() === 'superadmin' ||
        actor.role.toLowerCase() === 'super_admin' ||
        actor.role.toLowerCase() === 'super admin';
}

function requireSuperAdmin(actionName) {
    if (isSuperAdminSession()) return true;
    console.warn(`Security: blocked ${actionName} for non-Super Admin session.`);
    alert('🔒 Only Super Admin can perform this action.');
    return false;
}

async function auditSecurityAction(action, details = {}) {
    const actor = getCurrentActor();
    const entry = {
        id: 'AUD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        timestamp: new Date().toISOString(),
        action,
        username: actor.username,
        role: actor.role,
        branchId: actor.branchId,
        details
    };
    try {
        const logs = JSON.parse(originalGetItem.call(localStorage, 'mediflow_security_audit_logs') || '[]');
        logs.unshift(entry);
        originalSetItem.call(localStorage, 'mediflow_security_audit_logs', JSON.stringify(logs.slice(0, 1000)));
    } catch (e) { console.warn('Audit local save failed', e); }
    if (isFirebaseEnabled && db) {
        try {
            const current = JSON.parse(originalGetItem.call(localStorage, 'mediflow_security_audit_logs') || '[]');
            await db.collection('mediflow_data').doc('security_audit_logs').set({
                payload: current.slice(0, 1000),
                updatedAt: new Date().toISOString()
            });
        } catch (e) { console.warn('Audit cloud save failed', e); }
    }
}

function validateCurrentBranchAccess() {
    const branchId = sessionStorage.getItem('mediflow_current_branch') || currentBranchId || 'branch_default';
    if (typeof isWaiterMobileMode !== 'undefined' && isWaiterMobileMode) return branchId;
    if (!branches.some(b => b.id === branchId)) {
        const fallback = branches[0]?.id || 'branch_default';
        currentBranchId = fallback;
        sessionStorage.setItem('mediflow_current_branch', fallback);
        return fallback;
    }
    return branchId;
}

// Migrate legacy data if branches are empty
if (branches.length === 0) {
    branches.push({ id: 'branch_default', name: 'Main Branch' });
    localStorage.setItem('mediflow_branches', JSON.stringify(branches));
    const legacyKeys = ['products', 'sales', 'settings', 'purchases', 'expenses', 'categories', 'customers', 'customer_payments', 'suppliers', 'supplier_payments', 'held_carts', 'amc'];
    legacyKeys.forEach(k => {
        let data = originalGetItem.call(localStorage, `mediflow_${k}`);
        if (data) localStorage.setItem(`mediflow_branch_default_${k}`, data);
    });
}
let doctorsList = [];

// Data Variables (Loaded dynamically based on branch)
let products = [];
let sales = [];
let settings = {};
let purchases = [];
let expenses = [];
let categories = [];
let expenseCategories = [];
let cakeFlavors = [];
let cancelledDigitalOrders = [];
let amcData = null;
let customers = [];
let customerPayments = [];
let suppliers = [];
let supplierPayments = [];
let cart = [];
let heldCarts = [];
let staffList = [];
let attendanceLogs = [];
let staffAdvances = [];
let salaryPayments = [];
let stockInLogs = [];

function loadBranchData() {
    currentBranchId = validateCurrentBranchAccess();
    sales = getLegacyOrBranchData('mediflow_sales') || [];
    purchases = getLegacyOrBranchData('mediflow_purchases') || [];
    stockInLogs = getLegacyOrBranchData('mediflow_stock_in_logs') || [];

    let loadedProducts = getLegacyOrBranchData('mediflow_products') || [];
    if (loadedProducts.length === 0 && (sales.length > 0 || purchases.length > 0)) {
        loadedProducts = recoverProductsFromSales(loadedProducts, sales, purchases);
    }

    products = loadedProducts;
    localStorage.setItem('mediflow_products', JSON.stringify(products));

    settings = getLegacyOrBranchData('mediflow_settings') || {
        shopName: 'T7 BillPro', shopAddress: '123 Medical Street, City Center', shopPhone: '+91 9876543210', shopLogo: '', printerType: '3inch', printerName: 'Default System Printer', printCopies: 1, gstDefault: true, kotEnabled: true, currency: '₹'
    };
    if (settings.kotEnabled === undefined) settings.kotEnabled = true;
    if (!settings.printerName) settings.printerName = 'Default System Printer';
    if (!settings.printCopies) settings.printCopies = 1;
    if (!settings.currency) settings.currency = '₹';

    expenses = getLegacyOrBranchData('mediflow_expenses') || [];
    categories = getLegacyOrBranchData('mediflow_categories') || ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Ointment', 'Other'];
    categories = (Array.isArray(categories) ? categories : []).filter(isValidCategoryName);
    
    const catSet = new Set(categories.map(c => String(c).trim()).filter(Boolean));
    const catLowerSet = new Set(Array.from(catSet).map(c => c.toLowerCase()));
    
    if (Array.isArray(products)) {
        let prodMod = false;
        products.forEach(p => {
            if (p.category) {
                const catClean = String(p.category).trim();
                if (!isValidCategoryName(catClean)) {
                    p.category = 'Other';
                    prodMod = true;
                } else if (!catLowerSet.has(catClean.toLowerCase())) {
                    catLowerSet.add(catClean.toLowerCase());
                    catSet.add(catClean);
                }
            }
        });
        if (prodMod) {
            localStorage.setItem('mediflow_products', JSON.stringify(products));
        }
    }
    
    categories = Array.from(catSet).filter(isValidCategoryName);
    if (categories.length === 0) categories = ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Ointment', 'Other'];
    localStorage.setItem('mediflow_categories', JSON.stringify(categories));

    expenseCategories = getLegacyOrBranchData('mediflow_expense_categories') || ['Rent', 'Electricity', 'Salary', 'Maintenance', 'Other'];
    
    const defaultCakeFlavors = [
        { id: 'cf_1', name: 'Chocolate Fudge', price: 650, enabled: true },
        { id: 'cf_2', name: 'Black Forest', price: 550, enabled: true },
        { id: 'cf_3', name: 'Red Velvet', price: 700, enabled: true },
        { id: 'cf_4', name: 'Butterscotch', price: 500, enabled: true },
        { id: 'cf_5', name: 'Pineapple Fresh Fruit', price: 500, enabled: true },
        { id: 'cf_6', name: 'Vanilla Strawberry', price: 550, enabled: true },
        { id: 'cf_7', name: 'Nutella Truffle', price: 800, enabled: true },
        { id: 'cf_8', name: 'Custom / Other', price: 600, enabled: true }
    ];
    cakeFlavors = getLegacyOrBranchData('mediflow_cake_flavors') || defaultCakeFlavors;
    cancelledDigitalOrders = getLegacyOrBranchData('mediflow_cancelled_digital_orders') || [];
    amcData = getLegacyOrBranchData('mediflow_amc') || null;
    customers = getLegacyOrBranchData('mediflow_customers') || [];
    customerPayments = getLegacyOrBranchData('mediflow_customer_payments') || [];
    suppliers = getLegacyOrBranchData('mediflow_suppliers') || [];
    supplierPayments = getLegacyOrBranchData('mediflow_supplier_payments') || [];
    heldCarts = getLegacyOrBranchData('mediflow_held_carts') || [];

    const storedStaff = getLegacyOrBranchData('mediflow_staff');
    if (!storedStaff || (Array.isArray(storedStaff) && storedStaff.length === 0)) {
        if (currentBranchId === 'branch_default' || currentBranchId === 'main') {
            staffList = [
                { id: 'STF01', name: 'Ramesh Kumar', phone: '9876543210', role: 'Pharmacist', salaryType: 'Monthly', salaryRate: 18000, joiningDate: '2025-01-10', status: 'Active', address: 'Main Street', branchId: currentBranchId },
                { id: 'STF02', name: 'Suresh Kumar', phone: '9876543211', role: 'Sales Assistant', salaryType: 'Daily', salaryRate: 600, joiningDate: '2025-03-15', status: 'Active', address: 'Cross Road', branchId: currentBranchId }
            ];
        } else {
            staffList = [];
        }
        localStorage.setItem('mediflow_staff', JSON.stringify(staffList));
    } else {
        staffList = storedStaff;
    }

    attendanceLogs = getLegacyOrBranchData('mediflow_attendance') || [];
    staffAdvances = getLegacyOrBranchData('mediflow_staff_advances') || [];
    salaryPayments = getLegacyOrBranchData('mediflow_salary_payments') || [];
    cashTransactions = getLegacyOrBranchData('mediflow_cash_transactions') || [];
    cashOpenings = getLegacyOrBranchData('mediflow_cash_openings') || {};
    doctorsList = getLegacyOrBranchData('mediflow_doctors') || [];
    cart = [];
    if (typeof renderBarcodeProductOptions === 'function') renderBarcodeProductOptions();
}

// --- Firebase Config & Synchronization ---
const firebaseConfig = {
    apiKey: "AIzaSyDHWpCbtbs2G3_Gtm0-XKI2bxLoBG5TIDY",
    authDomain: "dical-billing-001.firebaseapp.com",
    databaseURL: "https://dical-billing-001-default-rtdb.firebaseio.com",
    projectId: "dical-billing-001",
    storageBucket: "dical-billing-001.firebasestorage.app",
    messagingSenderId: "1022770660641",
    appId: "1:1022770660641:web:8a56086be5fb5b2867aa60",
    measurementId: "G-QFJCKQYP9P"
};

var db = null;
var isFirebaseEnabled = false;
var unsubscribeCloudListener = null;

function initFirebase() {
    try {
        if (typeof firebase !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_KEY") {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            isFirebaseEnabled = true;
            console.log("T7 BillPro Cloud Connected");
            
            // Start real-time Waiter Orders listener immediately!
            setupWaiterOrdersListener();
            
            // Start heavy data sync in background
            syncFromCloud().then(() => {
                setupCloudListener();
            });

            // Fallback: 5-second polling for Waiter Orders to guarantee delivery without page refresh
            setInterval(() => {
                if (isFirebaseEnabled && db) {
                    db.collection('waiter_orders')
                      .where('branchId', '==', currentBranchId)
                      .get()
                      .then(snapshot => {
                          let pendingKey = getPendingOrdersKey();
                          let digitalOrders = JSON.parse(localStorage.getItem(pendingKey)) || [];
                          let updated = false;
                          
                          snapshot.forEach(doc => {
                              const data = doc.data();
                              const docId = doc.id;
                              const statusStr = (data && data.status) ? String(data.status).toLowerCase() : '';
                              if (statusStr !== 'pending') return;

                              let idx = digitalOrders.findIndex(s => s.id === docId || s.invoiceNo === docId);
                              
                              if (idx === -1) {
                                  // We missed this order in real-time listener! Force add it.
                                  const orderRecord = {
                                      id: docId,
                                      invoiceNo: docId,
                                      date: data.createdAt || data.date || new Date().toISOString(),
                                      customer: data.customer || { name: 'Table ' + (data.tableNumber || '?'), phone: data.waiterName || '' },
                                      orderType: 'Dine-In',
                                      orderRef: data.orderRef || ('Table ' + (data.tableNumber || '?')),
                                      notes: data.notes || '',
                                      items: data.items || [],
                                      grandTotal: parseFloat(data.totalAmount || data.grandTotal) || 0,
                                      status: 'Pending',
                                      isDigitalOrder: true,
                                      isWaiterOrder: true,
                                      waiterName: data.waiterName || '',
                                      tableNumber: data.tableNumber || '',
                                      branchId: data.branchId
                                  };
                                  digitalOrders.unshift(orderRecord);
                                  updated = true;
                                  
                                  if (typeof playBeep === 'function') playBeep();
                                  if (typeof showMenuToast === 'function') showMenuToast(`🔔 New Waiter Order from ${orderRecord.customer.name}! (Auto-Fetched)`);
                              }
                          });
                          
                          if (updated) {
                              localStorage.setItem(pendingKey, JSON.stringify(digitalOrders));
                              if (typeof renderDigitalOrders === 'function') renderDigitalOrders();
                          }
                      }).catch(err => console.warn("Polling Waiter Orders Error:", err));
                }
            }, 5000);
        }
    } catch (e) {
        console.error("Cloud Connection Error:", e);
    }
}

window.initApp = initApp;

async function syncToCloud(collectionName, documentData) {
    // Cloud sync has been explicitly disabled by user request to keep all data locally.
    return;
}

function extractArrayData(cloudData) {
    if (!cloudData) return [];
    if (Array.isArray(cloudData)) return cloudData;
    if (cloudData.data && Array.isArray(cloudData.data)) return cloudData.data;
    if (cloudData.payload && Array.isArray(cloudData.payload)) return cloudData.payload;
    if (cloudData.payload && cloudData.payload.data && Array.isArray(cloudData.payload.data)) return cloudData.payload.data;
    return [];
}

var isSyncingFromCloud = false;

async function syncFromCloud() {
    // Cloud sync has been explicitly disabled by user request to keep all data locally.
    return;
}

function setupCloudListener() {
    // Cloud listener has been explicitly disabled by user request to keep all data locally.
    return;
}


async function backupAllToCloud() {
    if (!isFirebaseEnabled || !db) {
        alert('Cloud backup is not connected.');
        return;
    }
    const btn = document.getElementById('cloud-backup-btn');
    const originalText = btn ? btn.innerHTML : '<i data-lucide="cloud-upload"></i> BACKUP TO CLOUD';
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Backing up...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        await syncToCloud('products', { data: products });
        await syncToCloud('sales', { data: sales });
        await syncToCloud('purchases', { data: purchases });
        await syncToCloud('expenses', { data: expenses });
        await syncToCloud('categories', { data: categories });
        await syncToCloud('expenseCategories', { data: expenseCategories });
        await syncToCloud('customers', { data: customers });
        await syncToCloud('suppliers', { data: suppliers });
        await syncToCloud('admins', { data: admins });
        await syncToCloud('customerPayments', { data: customerPayments });
        await syncToCloud('supplierPayments', { data: supplierPayments });
        await syncToCloud('branches', { data: branches });
        alert('All local data successfully backed up to Firebase!');
    } catch (e) {
         alert('Backup failed: ' + e.message);
         console.error(e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

async function manualSyncFromCloud() {
    if (!isFirebaseEnabled || !db) {
        alert('Cloud sync is not connected.');
        return;
    }
    const btn = document.getElementById('cloud-sync-btn');
    const originalText = btn ? btn.innerHTML : '<i data-lucide="cloud-download"></i> SYNC FROM CLOUD';
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Syncing...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        await syncFromCloud();
        alert('Data successfully synced from cloud!');
    } catch (e) {
        alert('Sync failed: ' + e.message);
        console.error(e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

window.backupAllToCloud = backupAllToCloud;
window.manualSyncFromCloud = manualSyncFromCloud;
window.syncFromCloud = syncFromCloud;
window.syncToCloud = syncToCloud;

let activeSection = 'dashboard';
let currentPayMode = 'Cash';
let isReturnMode = false;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    checkLoginStatus();
    initFirebase();
    lucide.createIcons();
    applySavedSidebarState();
    setupLoginHandler();
    setupEventListeners();
});

function applySavedSidebarState() {
    const isCollapsed = localStorage.getItem('mediflow_sidebar_collapsed') === 'true';
    const sidebar = document.querySelector('aside');
    if (sidebar && isCollapsed) {
        sidebar.classList.add('sidebar-collapsed');
    }
}

function checkLoginStatus() {
    const branchFromUrl = typeof getBranchIdFromURL === 'function' ? getBranchIdFromURL() : null;
    if (branchFromUrl) {
        currentBranchId = branchFromUrl;
        sessionStorage.setItem('mediflow_current_branch', branchFromUrl);
    }

    const isCustomerView = window.location.hash.includes('#menu-card') || 
                           window.location.hash.includes('#menu') ||
                           window.location.search.includes('mode=customer') || 
                           window.location.search.includes('menu=true') ||
                           window.location.search.includes('action=order_cake') ||
                           window.location.hash.includes('cake=1');

    if (isCustomerView && sessionStorage.getItem('mediflow_logged_in') !== 'true') {
        enableCustomerMenuView();
        return;
    }

    const isLoggedIn = sessionStorage.getItem('mediflow_logged_in');
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');

    if (isLoggedIn === 'true') {
        const loggedInUsername = sessionStorage.getItem('mediflow_user');
        
        // Branch lock check
        const currentBranch = branches.find(b => b.id === (sessionStorage.getItem('mediflow_current_branch') || 'branch_default'));
        if (currentBranch && currentBranch.isLocked) {
            let lockActions = '';
            if (loggedInUsername === 'VIKI') {
                window.unlockCurrentBranch = function(id) {
                    const branch = branches.find(b => b.id === id);
                    if (branch) {
                        branch.isLocked = false;
                        localStorage.setItem('mediflow_branches', JSON.stringify(branches));
                        window.location.reload();
                    }
                };
                window.switchBranchFromLockScreen = function(val) {
                    if (val) {
                        sessionStorage.setItem('mediflow_current_branch', val);
                        window.location.reload();
                    }
                };
                
                lockActions = `
                    <button onclick="unlockCurrentBranch('${currentBranch.id}')" style="margin-top: 1rem; background: var(--primary-color); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; width: 100%; font-size: 1.1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 5px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                        Super Admin: Unlock Branch
                    </button>
                    <div style="margin-top: 1.5rem; text-align: left;">
                        <label style="font-size: 0.9rem; color: #64748b;">Or switch to another branch:</label>
                        <select onchange="switchBranchFromLockScreen(this.value)" style="margin-top: 0.5rem; width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #cbd5e1;">
                            <option value="">Select a branch...</option>
                            ${branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                        </select>
                    </div>
                `;
            }

            window.logoutFromLock = function() {
                sessionStorage.removeItem('mediflow_logged_in');
                sessionStorage.removeItem('mediflow_user');
                window.location.reload();
            };

            document.body.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: #f8fafc; font-family: 'Inter', sans-serif;">
                    <div style="text-align: center; background: white; padding: 3rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 450px; width: 90%;">
                        <div style="color: #dc2626; margin-bottom: 1.5rem;">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </div>
                        <h2 style="color: #dc2626; margin-bottom: 1rem; font-size: 1.8rem;">Branch Locked</h2>
                        <p style="color: #475569; margin-bottom: 2rem; font-size: 1.1rem; line-height: 1.5;">This branch has been locked.</p>
                        
                        ${loggedInUsername !== 'VIKI' ? `
                            <h1 style="color: #0f172a; margin-bottom: 2rem; font-size: 2.5rem; letter-spacing: 2px;">9360039283</h1>
                            <a href="https://wa.me/919360039283?text=Hello%20Super%20Admin,%20my%20branch%20(${encodeURIComponent(currentBranch.name)})%20is%20locked." target="_blank" style="background: #25D366; color: white; display: flex; align-items: center; justify-content: center; gap: 0.75rem; text-decoration: none; padding: 16px 24px; border-radius: 8px; font-weight: bold; font-size: 1.1rem; width: 100%; box-sizing: border-box; box-shadow: 0 4px 6px -1px rgba(37, 211, 102, 0.2); transition: transform 0.2s;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg> Send Message
                            </a>
                        ` : ''}

                        ${lockActions}
                        
                        <button onclick="logoutFromLock()" style="margin-top: 1.5rem; background: transparent; border: none; color: #64748b; cursor: pointer; text-decoration: underline;">Back to Login</button>
                    </div>
                </div>
            `;
            return;
        }
        
        let actualRole = 'staff'; 
        if (loggedInUsername === 'VIKI') {
            actualRole = 'superadmin';
            currentBranchId = sessionStorage.getItem('mediflow_current_branch') || (branches.length > 0 ? branches[0].id : 'branch_default');
        } else {
            const foundUser = admins.find(a => a.username === loggedInUsername);
            if (foundUser) {
                actualRole = foundUser.role;
                currentBranchId = foundUser.branchId || 'branch_default';
            }
        }
        
        loadBranchData();
        setupGlobalBranchSelector(actualRole);

        const isStaff = (actualRole === 'staff');

        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) {
            appContainer.style.display = 'flex';
            appContainer.classList.add('active-app');
        }

        const hideForStaff = ['dashboard', 'products', 'purchase', 'customers', 'suppliers', 'sales', 'settings'];
        hideForStaff.forEach(secName => {
            const navLink = document.querySelector(`.nav-item[data-section="${secName}"]`);
            if (navLink) navLink.style.display = isStaff ? 'none' : 'flex';
        });
        
        const navUsers = document.getElementById('nav-users');
        if (navUsers) navUsers.style.display = (actualRole === 'superadmin') ? 'flex' : 'none';
        
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) createUserBtn.style.display = (actualRole === 'superadmin') ? 'inline-flex' : 'none';

        initApp();
        renderAdmins();

        if (sessionStorage.getItem('mediflow_open_settings') === 'true') {
            sessionStorage.removeItem('mediflow_open_settings');
            setTimeout(() => switchSection('settings'), 200);
        } else if (isStaff && activeSection === 'dashboard') {
            switchSection('billing');
        } else {
            switchSection(activeSection);
        }
    } else {
        if (isCustomerView) {
            enableCustomerMenuView();
            return;
        }
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) {
            appContainer.style.display = 'none';
            appContainer.classList.remove('active-app');
        }
    }
}

function setupGlobalBranchSelector(role) {
    const container = document.getElementById('global-branch-container');
    const selector = document.getElementById('global-branch-selector');
    const navBranches = document.getElementById('nav-branches');
    
    if (role === 'superadmin') {
        if (container) container.style.display = 'block';
        if (navBranches) navBranches.style.display = 'flex';
        if (selector) {
            selector.innerHTML = '';
            branches.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.name;
                if (b.id === currentBranchId) opt.selected = true;
                selector.appendChild(opt);
            });
            selector.onchange = (e) => {
                sessionStorage.setItem('mediflow_current_branch', e.target.value);
                window.location.reload(); 
            };
        }
    } else {
        if (container) container.style.display = 'none';
        if (navBranches) navBranches.style.display = 'none';
    }
}

function setupLoginHandler() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        const error = document.getElementById('login-error');

        // Check Super Admin
        if (user === 'VIKI' && pass === 'VIKI1101') {
            sessionStorage.setItem('mediflow_logged_in', 'true');
            sessionStorage.setItem('mediflow_user', 'VIKI');
            sessionStorage.setItem('mediflow_user_role', 'super_admin');
            sessionStorage.setItem('mediflow_current_branch', sessionStorage.getItem('mediflow_current_branch') || 'branch_default');
            auditSecurityAction('superadmin_login');
            checkLoginStatus();
            if (typeof setupWaiterOrdersListener === 'function') setupWaiterOrdersListener();
            try { 
                const hasBackupDir = await getBackupDirHandle();
                if (!hasBackupDir) exportData(); 
            } catch(e) {}
            try { await printShiftSummaryReceipt('LOGIN'); } catch(e) {}
            return;
        }

        // Check Other Admins
        const found = admins.find(a => a.username === user && a.password === pass);
        if (found) {
            if (found.branchId) {
                sessionStorage.setItem('mediflow_current_branch', found.branchId);
            }
            sessionStorage.setItem('mediflow_logged_in', 'true');
            sessionStorage.setItem('mediflow_user', user);
            sessionStorage.setItem('mediflow_user_role', found.role || 'admin');
            sessionStorage.setItem('mediflow_current_branch', found.branchId || 'branch_default');
            auditSecurityAction('admin_login', { branchId: found.branchId || 'branch_default' });
            checkLoginStatus();
            if (typeof setupWaiterOrdersListener === 'function') setupWaiterOrdersListener();
            try { 
                const hasBackupDir = await getBackupDirHandle();
                if (!hasBackupDir) exportData(); 
            } catch(e) {}
            try { await printShiftSummaryReceipt('LOGIN'); } catch(e) {}
        } else {
            error.style.display = 'block';
            setTimeout(() => { error.style.display = 'none'; }, 3000);
        }
    });
}

function initApp() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'waiter' || urlParams.get('mode') === 'waiter-order') {
            isWaiterMobileMode = true;
            const targetBranch = urlParams.get('branch');
            const targetWaiter = urlParams.get('waiter');
            if (targetBranch) {
                currentBranchId = targetBranch;
                sessionStorage.setItem('mediflow_current_branch', targetBranch);
            }
            if (targetWaiter) {
                selectedWaiterChipVal = targetWaiter;
            }
            if (typeof loadBranchData === 'function') loadBranchData();
            initWaiterMobileMode();
            return;
        }

        // Data Migration: Ensure all sales have grandTotal (fix for legacy 'total' field)
        sales.forEach(s => {
            if (s.total !== undefined && s.grandTotal === undefined) {
                s.grandTotal = s.total;
            }
        });

        // Set theme
        document.body.setAttribute('data-theme', currentTheme);
        updateThemeIcon();

        // Set current date
        const now = new Date();
        const dateEl = document.getElementById('current-date');
        if (dateEl) dateEl.textContent = now.toDateString();

        // Generate first invoice number if in billing
        generateInvoiceNumber();

        // Initial renders with element safety
        renderDashboard();
        renderProducts();
        renderSalesHistory();
        renderPurchases();
        renderExpenses();
        renderCategoryManagement();
        renderExpenseCategoryManagement();
        if (typeof renderCakeFlavorsManagement === 'function') renderCakeFlavorsManagement();
        renderCustomers();
        renderSuppliers();
        renderCartTabs();
        loadSettings();
        if (typeof renderDigitalOrders === 'function') renderDigitalOrders();
        if (typeof renderTableManagement === 'function') renderTableManagement();
        checkAMCStatus();
        
        lucide.createIcons();
    } catch (error) {
        console.error('App initialization error:', error);
    }
}

function getBranchAMC(branchId) {
    if (!amcData || typeof amcData !== 'object') amcData = {};
    const target = branchId || currentBranchId || 'main';

    if (amcData.branches && amcData.branches[target]) {
        return amcData.branches[target];
    }
    return {
        planName: amcData.planName || 'Standard Plan',
        expiryDate: amcData.expiryDate || '',
        contactInfo: amcData.contactInfo || '9360039283',
        isLocked: !!amcData.isLocked
    };
}

function renderAMCBranchOptions() {
    const branchSelect = document.getElementById('amc-target-branch');
    if (!branchSelect) return;

    const currentVal = branchSelect.value;
    branchSelect.innerHTML = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = '🌐 ALL BRANCHES (Global System Default)';
    branchSelect.appendChild(allOpt);

    (branches || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `🏢 ${b.name} (${b.id})`;
        if (b.id === currentVal) opt.selected = true;
        branchSelect.appendChild(opt);
    });

    if (!branchSelect.value) branchSelect.value = 'all';
    onAMCBranchSelectChange();
}

function onAMCBranchSelectChange() {
    const branchSelect = document.getElementById('amc-target-branch');
    const targetBranchId = branchSelect ? branchSelect.value : 'all';
    
    const branchNameEl = document.getElementById('super-amc-branch-name');
    if (branchNameEl) {
        if (targetBranchId === 'all') {
            branchNameEl.textContent = 'ALL BRANCHES (Global System Default)';
        } else {
            const foundB = (branches || []).find(b => b.id === targetBranchId);
            branchNameEl.textContent = foundB ? `${foundB.name} (${foundB.id})` : targetBranchId;
        }
    }

    const branchAMC = getBranchAMC(targetBranchId === 'all' ? currentBranchId : targetBranchId);

    const setPlanInput = document.getElementById('set-amc-plan');
    const setExpiryInput = document.getElementById('set-amc-expiry');
    const setContactInput = document.getElementById('set-amc-contact');

    if (setPlanInput) setPlanInput.value = branchAMC.planName || '';
    if (setExpiryInput) setExpiryInput.value = branchAMC.expiryDate || '';
    if (setContactInput) setContactInput.value = branchAMC.contactInfo || '9360039283';

    const planEl = document.getElementById('super-amc-plan');
    const daysEl = document.getElementById('super-amc-days');
    const badgeEl = document.getElementById('super-amc-lock-status-badge');
    const btnLock = document.getElementById('btn-toggle-branch-lock');

    if (branchAMC.expiryDate) {
        const now = new Date();
        const expiry = new Date(branchAMC.expiryDate);
        const diffTime = expiry - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isUnlimited = (branchAMC.planName && (branchAMC.planName.toLowerCase().includes('unlimited') || branchAMC.planName.toLowerCase().includes('lifetime'))) || diffDays > 3000;

        if (planEl) planEl.textContent = branchAMC.planName || 'Standard';
        if (daysEl) {
            daysEl.textContent = isUnlimited ? 'Unlimited / Lifetime (Active)' : (diffDays < 0 ? 'Expired' : `${diffDays} days`);
            daysEl.style.color = (diffDays < 0 && !isUnlimited) ? 'var(--danger-color)' : ((diffDays <= 15 && !isUnlimited) ? 'var(--warning-color)' : '#16a34a');
        }
    } else {
        if (planEl) planEl.textContent = branchAMC.planName || 'Not Set';
        if (daysEl) {
            daysEl.textContent = 'Unlimited / Lifetime (Active)';
            daysEl.style.color = '#16a34a';
        }
    }

    const isLocked = !!branchAMC.isLocked;
    if (badgeEl) {
        badgeEl.textContent = isLocked ? '🔒 LOCKED BY SUPER ADMIN' : '✓ ACTIVE';
        badgeEl.style.background = isLocked ? '#dc2626' : '#16a34a';
    }

    if (btnLock) {
        if (isLocked) {
            btnLock.innerHTML = '<i data-lucide="unlock" style="width: 18px; height: 18px; vertical-align: middle;"></i> UNLOCK BRANCH';
            btnLock.style.background = '#16a34a';
            btnLock.style.boxShadow = '0 4px 10px rgba(22, 163, 74, 0.2)';
        } else {
            btnLock.innerHTML = '<i data-lucide="lock" style="width: 18px; height: 18px; vertical-align: middle;"></i> LOCK BRANCH';
            btnLock.style.background = '#dc2626';
            btnLock.style.boxShadow = '0 4px 10px rgba(220, 38, 38, 0.2)';
        }
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
}

function toggleBranchLockStatus() {
    const branchSelect = document.getElementById('amc-target-branch');
    const targetBranchId = branchSelect ? branchSelect.value : 'all';

    if (!amcData || typeof amcData !== 'object') amcData = {};
    if (!amcData.branches) amcData.branches = {};

    const currentBranchAMC = getBranchAMC(targetBranchId === 'all' ? currentBranchId : targetBranchId);
    const newLockedState = !currentBranchAMC.isLocked;

    if (targetBranchId === 'all') {
        amcData.isLocked = newLockedState;
        (branches || []).forEach(b => {
            if (!amcData.branches[b.id]) amcData.branches[b.id] = { ...currentBranchAMC };
            amcData.branches[b.id].isLocked = newLockedState;
        });
    } else {
        amcData.branches[targetBranchId] = {
            ...currentBranchAMC,
            isLocked: newLockedState
        };
    }

    localStorage.setItem('mediflow_amc', JSON.stringify(amcData));
    if (typeof syncToCloud === 'function') syncToCloud('amc', amcData);

    onAMCBranchSelectChange();
    checkAMCStatus();

    const targetName = targetBranchId === 'all' ? 'All Branches' : targetBranchId;
    alert(`Branch (${targetName}) has been ${newLockedState ? 'LOCKED 🔒' : 'UNLOCKED 🔓'} successfully!`);
}

function checkAMCStatus() {
    const activeBranchAMC = getBranchAMC(currentBranchId);

    const loggedInUser = sessionStorage.getItem('mediflow_user');
    const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
    const isSuperAdmin = !loggedInUser || loggedInUser === 'VIKI' || (loggedInUser && loggedInUser.toLowerCase() === 'viki') || userRole === 'super_admin' || userRole === 'Super Admin' || loggedInUser === 'superadmin' || loggedInUser === 'admin';

    let banner = document.getElementById('amc-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'amc-banner';
        document.body.prepend(banner);
    }
    
    banner.style.padding = '10px 20px';
    banner.style.textAlign = 'center';
    banner.style.fontWeight = 'bold';
    banner.style.zIndex = '9999';
    banner.style.position = 'sticky';
    banner.style.top = '0';
    banner.style.width = '100%';
    
    const genBillBtn = document.getElementById('generate-bill-btn');

    // 1. Check if Branch is explicitly Locked by Super Admin
    if (activeBranchAMC.isLocked) {
        if (isSuperAdmin) {
            banner.style.backgroundColor = 'var(--danger-color)';
            banner.style.color = '#fff';
            banner.innerHTML = `🔒 THIS BRANCH IS LOCKED BY SUPER ADMIN. <span style="margin-left: 15px;"><button onclick="switchSection('settings');" style="background: white; color: var(--danger-color); border: none; padding: 4px 14px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Open Settings to Extend AMC / Unlock Branch</button></span>`;
            banner.style.display = 'block';
            removeAMCLockout();
            if (genBillBtn) genBillBtn.disabled = false;
        } else {
            banner.style.backgroundColor = 'var(--danger-color)';
            banner.style.color = '#fff';
            banner.innerHTML = `🔒 THIS BRANCH HAS BEEN LOCKED BY SUPER ADMIN. Access is temporarily restricted. Contact: ${activeBranchAMC.contactInfo || '9360039283'}`;
            banner.style.display = 'block';
            if (genBillBtn) genBillBtn.disabled = true;
            enforceAMCLockout();
        }
        return;
    }

    if (!activeBranchAMC.expiryDate) {
        banner.style.display = 'none';
        removeAMCLockout();
        if (genBillBtn) genBillBtn.disabled = false;
        return;
    }

    const isUnlimited = (activeBranchAMC.planName && (activeBranchAMC.planName.toLowerCase().includes('unlimited') || activeBranchAMC.planName.toLowerCase().includes('lifetime')));
    const now = new Date();
    const expiry = new Date(activeBranchAMC.expiryDate);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (isUnlimited || diffDays > 3000) {
        banner.style.display = 'none';
        removeAMCLockout();
        if (genBillBtn) genBillBtn.disabled = false;
        return;
    }

    if (diffDays <= 0) {
        if (isSuperAdmin) {
            banner.style.backgroundColor = 'var(--danger-color)';
            banner.style.color = '#fff';
            banner.innerHTML = `AMC Subscription Expired for this Branch on ${new Date(activeBranchAMC.expiryDate).toLocaleDateString()}. <span style="margin-left: 15px;"><button onclick="switchSection('settings');" style="background: white; color: var(--danger-color); border: none; padding: 4px 14px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Open Settings to Extend AMC</button></span>`;
            banner.style.display = 'block';
            removeAMCLockout();
            if (genBillBtn) genBillBtn.disabled = false;
        } else {
            banner.style.backgroundColor = 'var(--danger-color)';
            banner.style.color = '#fff';
            banner.innerHTML = `AMC Subscription Expired on ${new Date(activeBranchAMC.expiryDate).toLocaleDateString()}. Please renew to ensure uninterrupted service. Contact: ${activeBranchAMC.contactInfo}`;
            banner.style.display = 'block';
            if (genBillBtn) genBillBtn.disabled = true;
            enforceAMCLockout();
        }
    } else if (diffDays <= 15) {
        banner.style.backgroundColor = 'var(--warning-color)';
        banner.style.color = '#fff';
        banner.innerHTML = `Your AMC subscription (${activeBranchAMC.planName}) expires in ${diffDays} days on ${new Date(activeBranchAMC.expiryDate).toLocaleDateString()}. Please contact ${activeBranchAMC.contactInfo} for renewal.`;
        banner.style.display = 'block';
        if (genBillBtn) genBillBtn.disabled = false;
        removeAMCLockout();
    } else {
        banner.style.display = 'none';
        removeAMCLockout();
        if (genBillBtn) genBillBtn.disabled = false;
    }
}

function enforceAMCLockout() {
    const loggedInUser = sessionStorage.getItem('mediflow_user');
    const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
    const isSuperAdmin = !loggedInUser || loggedInUser === 'VIKI' || (loggedInUser && loggedInUser.toLowerCase() === 'viki') || userRole === 'super_admin' || userRole === 'Super Admin' || loggedInUser === 'superadmin' || loggedInUser === 'admin';

    if (isSuperAdmin) {
        removeAMCLockout();
        return;
    }

    let lockScreen = document.getElementById('amc-lock-screen');
    if (!lockScreen) {
        lockScreen = document.createElement('div');
        lockScreen.id = 'amc-lock-screen';
        lockScreen.style.position = 'fixed';
        lockScreen.style.top = '0';
        lockScreen.style.left = '0';
        lockScreen.style.width = '100vw';
        lockScreen.style.height = '100vh';
        lockScreen.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
        lockScreen.style.color = 'white';
        lockScreen.style.zIndex = '99999';
        lockScreen.style.display = 'flex';
        lockScreen.style.flexDirection = 'column';
        lockScreen.style.alignItems = 'center';
        lockScreen.style.justifyContent = 'center';
        lockScreen.style.backdropFilter = 'blur(10px)';
        document.body.appendChild(lockScreen);
    }
    
    lockScreen.innerHTML = `
        <i data-lucide="lock" style="width: 64px; height: 64px; color: var(--danger-color); margin-bottom: 20px;"></i>
        <h1 style="font-size: 2.5rem; margin-bottom: 10px; color: var(--danger-color);">SYSTEM LOCKED</h1>
        <p style="font-size: 1.2rem; margin-bottom: 30px; text-align: center; max-width: 500px;">The Annual Maintenance Contract (AMC) for this branch has expired or has been locked by Super Admin. Please contact the administrator (${amcData ? (amcData.contactInfo || 'Support') : 'Support'}) to renew or unlock.</p>
        <button onclick="document.getElementById('logout-btn').click();" style="padding: 15px 30px; font-size: 1.1rem; background: var(--danger-color); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            Logout
        </button>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    lockScreen.style.display = 'flex';
}

function removeAMCLockout() {
    const lockScreen = document.getElementById('amc-lock-screen');
    if (lockScreen) {
        lockScreen.style.display = 'none';
    }
}

function loadSettings() {
    try {
        const fields = {
            'set-shop-name': settings.shopName,
            'set-shop-address': settings.shopAddress,
            'set-shop-phone': settings.shopPhone,
            'set-shop-gstin': settings.shopGstin,
            'set-shop-logo': settings.shopLogo,
            'set-shop-upi': settings.shopUpi,
            'set-printer-type': settings.printerType,
            'set-currency': settings.currency
        };
        
        for (const [id, val] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        }

        if (settings.shopLogo) {
            const previewContainer = document.getElementById('logo-preview-container');
            const previewImg = document.getElementById('logo-preview');
            if (previewContainer && previewImg) {
                previewImg.src = settings.shopLogo;
                previewContainer.style.display = 'block';
            }
        }

        // AMC Panel handling
        const user = sessionStorage.getItem('mediflow_user');
        const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
        const isSuperAdmin = !user || user === 'VIKI' || (user && user.toLowerCase() === 'viki') || userRole === 'super_admin' || userRole === 'Super Admin' || user === 'superadmin' || user === 'admin';

        if (isSuperAdmin) {
            const amcPanel = document.getElementById('amc-admin-panel');
            if (amcPanel) {
                amcPanel.style.display = 'block';
                renderAMCBranchOptions();
            }
            const amcBranchPanel = document.getElementById('amc-branch-panel');
            if (amcBranchPanel) amcBranchPanel.style.display = 'none';
        } else {
            const amcAdminPanel = document.getElementById('amc-admin-panel');
            if (amcAdminPanel) amcAdminPanel.style.display = 'none';
            
            const amcBranchPanel = document.getElementById('amc-branch-panel');
            if (amcBranchPanel) {
                amcBranchPanel.style.display = 'block';
                const branchAMC = getBranchAMC(currentBranchId);

                if (branchAMC && branchAMC.expiryDate) {
                    const now = new Date();
                    const expiry = new Date(branchAMC.expiryDate);
                    const diffTime = expiry - now;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const isUnlimited = (branchAMC.planName && (branchAMC.planName.toLowerCase().includes('unlimited') || branchAMC.planName.toLowerCase().includes('lifetime'))) || diffDays > 3000;
                    
                    document.getElementById('branch-amc-plan').textContent = branchAMC.planName || 'Standard';
                    document.getElementById('branch-amc-days').textContent = isUnlimited ? 'Unlimited / Lifetime (Active)' : (diffDays < 0 ? 'Expired' : `${diffDays} days`);
                    if (diffDays < 0 && !isUnlimited) {
                        document.getElementById('branch-amc-days').style.color = 'var(--danger-color)';
                    } else if (diffDays <= 15 && !isUnlimited) {
                        document.getElementById('branch-amc-days').style.color = 'var(--warning-color)';
                    } else {
                        document.getElementById('branch-amc-days').style.color = '#16a34a';
                    }
                } else {
                    document.getElementById('branch-amc-plan').textContent = 'Not Set';
                    document.getElementById('branch-amc-days').textContent = 'Unlimited / Lifetime (Active)';
                    document.getElementById('branch-amc-days').style.color = '#16a34a';
                }
            }
        }
        const gstEl = document.getElementById('set-gst-default');
        if (gstEl) gstEl.checked = !!settings.gstDefault;

        // Apply currency to UI
        document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = settings.currency || '₹');
        
        // WhatsApp Float
        const waBtn = document.getElementById('whatsapp-float');
        if (waBtn) {
            const shopNameStr = settings.shopName ? settings.shopName : 'your system';
            const message = encodeURIComponent(`Hello, I am contacting you regarding ${shopNameStr}.`);
            waBtn.href = `https://wa.me/919360039283?text=${message}`;
        }

        // Table Management nav visibility
        const navTableBtn = document.getElementById('nav-table-mgmt');
        if (navTableBtn) navTableBtn.style.display = settings.enableTableMgmt ? 'flex' : 'none';
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

// --- Navigation ---
function switchSection(sectionId) {
    if (typeof isCustomerViewActive !== 'undefined' && isCustomerViewActive || (document.body && document.body.classList.contains('customer-mode'))) {
        sectionId = 'menu-card';
    }
    // Update UI
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');

    // Update Title
    const titles = {
        'dashboard': 'Dashboard',
        'billing': 'Billing Terminal',
        'products': 'Product Management',
        'purchase': 'Purchase Records & Invoices',
        'stock-in': 'Stock In & Inventory Restock',
        'expenses': 'Expense Management',
        'customers': 'Customer Management',
        'suppliers': 'Supplier Management',
        'sales': 'Sales History',
        'settings': 'Application Settings',
        'reports': 'Business Reports',
        'menu-card': 'Digital Menu Card',
        'digital-orders': 'Digital Menu Orders',
        'users': 'Staff & Admin Management',
        'branches': 'Branch Management',
        'staff-management': 'Staff Management & Payroll',
        'barcode-labels': 'Product Barcode Label Printer'
    };
    if (document.getElementById('section-title')) {
        document.getElementById('section-title').textContent = titles[sectionId] || 'T7 BillPro';
    }
    activeSection = sectionId;

    // Close mobile sidebar after section selection
    const sidebar = document.querySelector('aside');
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove('sidebar-open');
    }

    // Specific actions
    if (sectionId === 'dashboard') renderDashboard();
    if (sectionId === 'customers') renderCustomers();
    if (sectionId === 'suppliers') renderSuppliers();
    if (sectionId === 'purchase') {
        renderProductDropdown();
        renderSupplierDropdown();
        renderPurchases();
    }
    if (sectionId === 'stock-in') {
        renderStockInPage();
    }
    if (sectionId === 'expenses') renderExpenses();
    if (sectionId === 'billing') {
        document.getElementById('billing-search').focus();
        generateInvoiceNumber();
        // Set GST default from settings
        document.getElementById('gst-toggle').checked = settings.gstDefault;
        const kotBtn = document.getElementById('print-kot-btn');
        if (kotBtn) kotBtn.style.display = (settings.kotEnabled !== false) ? 'inline-flex' : 'none';
        
        const waiterContainer = document.getElementById('billing-waiter-container');
        if (waiterContainer) {
            waiterContainer.style.display = settings.enableWaiterSelect ? 'block' : 'none';
            if (settings.enableWaiterSelect && typeof renderBillingWaiterOptions === 'function') renderBillingWaiterOptions();
        }
        const doctorContainer = document.getElementById('billing-doctor-container');
        if (doctorContainer) {
            doctorContainer.style.display = settings.enableDoctorSelect ? 'block' : 'none';
            if (settings.enableDoctorSelect && typeof renderBillingDoctorOptions === 'function') renderBillingDoctorOptions();
        }
        const tableContainer = document.getElementById('billing-table-container');
        if (tableContainer) {
            tableContainer.style.display = settings.enableTableMgmt ? 'block' : 'none';
        }
    }
    if (sectionId === 'settings') {
        ensureAllCategoriesFromProducts();
        if (typeof loadSettingsFields === 'function') loadSettingsFields();
        renderCategoryManagement();
    }
    if (sectionId === 'products') {
        ensureAllCategoriesFromProducts();
        renderProducts();
    }
    if (sectionId === 'balance') {
        initBalancePage();
    }
    if (sectionId === 'reports') {
        const today = new Date().toISOString().split('T')[0];
        if (!document.getElementById('report-start').value) document.getElementById('report-start').value = today;
        if (!document.getElementById('report-end').value) document.getElementById('report-end').value = today;
        generateReport();
    }
    if (sectionId === 'menu-card') {
        renderMenuCard();
    }
    if (sectionId === 'table-management') {
        if (typeof renderTableManagement === 'function') renderTableManagement();
    }
    if (sectionId === 'doctor-management') {
        if (typeof renderDoctorManagement === 'function') renderDoctorManagement();
    }
    if (sectionId === 'digital-orders') {
        renderDigitalOrders();
    }
    if (sectionId === 'branches') {
        renderBranches();
    }
    if (sectionId === 'staff-management') {
        renderStaffManagement();
    }
    if (sectionId === 'barcode-labels') {
        if (typeof renderBarcodeProductOptions === 'function') renderBarcodeProductOptions();
        if (typeof renderBarcodeLabelsPreview === 'function') renderBarcodeLabelsPreview();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Hide / Collapse Sidebar Menu Button
    const hideMenuBtn = document.getElementById('hide-menu-btn');
    if (hideMenuBtn) {
        hideMenuBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('aside');
            if (sidebar) {
                sidebar.classList.toggle('sidebar-collapsed');
                const collapsed = sidebar.classList.contains('sidebar-collapsed');
                localStorage.setItem('mediflow_sidebar_collapsed', collapsed ? 'true' : 'false');
            }
        });
    }

    // Sidebar Navigation Toggle (Header Top Button)
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('aside');
            if (sidebar) {
                if (window.innerWidth <= 768) {
                    sidebar.classList.toggle('sidebar-open');
                } else {
                    sidebar.classList.toggle('sidebar-collapsed');
                    const collapsed = sidebar.classList.contains('sidebar-collapsed');
                    localStorage.setItem('mediflow_sidebar_collapsed', collapsed ? 'true' : 'false');
                }
            }
        });
    }

    // Sidebar Navigation
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => switchSection(item.dataset.section));
    });

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Product Modal
    document.getElementById('open-add-product').addEventListener('click', () => openProductModal());
    document.getElementById('close-product-modal').addEventListener('click', closeProductModal);
    document.getElementById('cancel-product').addEventListener('click', closeProductModal);
    document.getElementById('product-form').addEventListener('submit', handleProductSubmit);

    // Billing Logic
    const billingSearch = document.getElementById('billing-search');
    billingSearch.addEventListener('input', handleBillingSearch);
    
    billingSearch.addEventListener('keydown', (e) => {
        const resultsDiv = document.getElementById('search-results');
        const items = resultsDiv.querySelectorAll('.search-item');
        const query = e.target.value.trim().toLowerCase();

        if (e.key === 'ArrowDown') {
            if (items.length > 0) {
                e.preventDefault();
                searchSelectedIndex = Math.min(searchSelectedIndex + 1, items.length - 1);
                updateSearchSelection(items);
            }
        } else if (e.key === 'ArrowUp') {
            if (items.length > 0) {
                e.preventDefault();
                searchSelectedIndex = Math.max(searchSelectedIndex - 1, 0);
                updateSearchSelection(items);
            }
        } else if (e.key === 'Enter') {
            if (e.ctrlKey) return; // Let the global shortcut handle it
            e.preventDefault();

            if (query === '') {
                if (cart.length > 0) {
                    processSale(true);
                }
                return;
            }

            // 1. Check for exact barcode match first
            const exactMatch = products.find(p => p.barcode && String(p.barcode).trim().toLowerCase() === query);
            if (exactMatch) {
                addToCart(exactMatch.id);
                e.target.value = '';
                resultsDiv.style.display = 'none';
                searchSelectedIndex = -1;
                return;
            }

            // 2. If user selected an item with arrow keys
            if (searchSelectedIndex >= 0 && searchSelectedIndex < items.length) {
                items[searchSelectedIndex].click();
                return;
            }

            // 3. Otherwise, if search result dropdown items exist, click the first one
            if (items.length > 0) {
                items[0].click();
            } else {
                // 4. Fallback check in products array if dropdown is empty or closed
                const matchProduct = products.find(p => 
                    p.barcode && String(p.barcode).trim().toLowerCase() === query
                ) || products.find(p => 
                    p.name && p.name.toLowerCase() === query
                );
                if (matchProduct) {
                    addToCart(matchProduct.id);
                    e.target.value = '';
                    resultsDiv.style.display = 'none';
                    searchSelectedIndex = -1;
                }
            }
        }
    });

    function updateSearchSelection(items) {
        items.forEach((item, index) => {
            if (index === searchSelectedIndex) {
                item.style.backgroundColor = 'var(--primary-light)';
            } else {
                item.style.backgroundColor = '';
            }
        });
    }
    
    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
    document.getElementById('gst-toggle').addEventListener('change', updateCartTotals);
    document.getElementById('discount-input').addEventListener('input', updateCartTotals);
    document.getElementById('discount-type').addEventListener('change', updateCartTotals);

    // Customer Auto-suggest
    const customerNameInput = document.getElementById('customer-name');
    customerNameInput.addEventListener('input', handleCustomerSuggest);
    customerNameInput.addEventListener('keydown', (e) => {
        const resultsDiv = document.getElementById('customer-suggestions');
        const items = resultsDiv.querySelectorAll('.search-item');
        if (items.length > 0 && resultsDiv.style.display === 'block') {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                customerSearchSelectedIndex = Math.min(customerSearchSelectedIndex + 1, items.length - 1);
                updateCustomerSearchSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                customerSearchSelectedIndex = Math.max(customerSearchSelectedIndex - 1, 0);
                updateCustomerSearchSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (customerSearchSelectedIndex >= 0 && customerSearchSelectedIndex < items.length) {
                    items[customerSearchSelectedIndex].click();
                } else if (items.length > 0) {
                    items[0].click();
                }
            }
        }
    });

    function updateCustomerSearchSelection(items) {
        items.forEach((item, index) => {
            if (index === customerSearchSelectedIndex) {
                item.style.backgroundColor = 'var(--primary-light)';
            } else {
                item.style.backgroundColor = '';
            }
        });
    }
    document.getElementById('customer-list-search').addEventListener('input', renderCustomers);

    // Sales History Filters
    document.getElementById('sale-date-from').addEventListener('change', renderSalesHistory);
    document.getElementById('sale-date-to').addEventListener('change', renderSalesHistory);
    if (document.getElementById('sale-search')) {
        document.getElementById('sale-search').addEventListener('input', renderSalesHistory);
    }
    
    // Menu Card Search & Controls
    if (document.getElementById('menu-card-search')) {
        document.getElementById('menu-card-search').addEventListener('input', (e) => renderMenuCard(e.target.value));
    }
    const clearSearchBtn = document.getElementById('menu-search-clear');
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            const input = document.getElementById('menu-card-search');
            if (input) {
                input.value = '';
                renderMenuCard('');
            }
        });
    }

    // View Switcher buttons
    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewList = document.getElementById('btn-view-list');
    if (btnViewGrid && btnViewList) {
        btnViewGrid.addEventListener('click', () => {
            activeMenuViewMode = 'grid';
            btnViewGrid.classList.add('active');
            btnViewList.classList.remove('active');
            renderMenuCard();
        });
        btnViewList.addEventListener('click', () => {
            activeMenuViewMode = 'list';
            btnViewList.classList.add('active');
            btnViewGrid.classList.remove('active');
            renderMenuCard();
        });
    }

    // Menu Order Form Submit
    const menuOrderForm = document.getElementById('menu-order-form');
    if (menuOrderForm) {
        menuOrderForm.addEventListener('submit', handleMenuOrderSubmit);
    }

    // Digital Orders Search & Status Filter
    if (document.getElementById('digital-orders-search')) {
        document.getElementById('digital-orders-search').addEventListener('input', renderDigitalOrders);
    }
    if (document.getElementById('digital-orders-status-filter')) {
        document.getElementById('digital-orders-status-filter').addEventListener('change', renderDigitalOrders);
    }

    document.getElementById('customer-form').addEventListener('submit', handleCustomerSubmit);
    document.getElementById('supplier-form').addEventListener('submit', handleSupplierSubmit);
    if (document.getElementById('product-list-search')) {
        document.getElementById('product-list-search').addEventListener('input', renderProducts);
    }

    const importProductsBtn = document.getElementById('import-products-btn');
    const productImportInput = document.getElementById('product-import-input');

    if (importProductsBtn && productImportInput) {
        importProductsBtn.addEventListener('click', () => {
            productImportInput.click();
        });

        productImportInput.addEventListener('change', (e) => {
            if (typeof importProducts === 'function') {
                importProducts(e);
            }
        });
    }

    const attachEvent = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    attachEvent('supplier-list-search', 'input', renderSuppliers);
    attachEvent('supplier-payment-form', 'submit', handleSupplierPaymentSubmit);
    attachEvent('payment-form', 'submit', handlePaymentSubmit);

    attachEvent('save-bill-btn', 'click', () => processSale(false));
    attachEvent('generate-bill-btn', 'click', () => processSale(true));
    attachEvent('whatsapp-bill-btn', 'click', () => processSale(false, true));

    // Logo Upload handler
    const logoUpload = document.getElementById('set-shop-logo-upload');
    if (logoUpload) {
        logoUpload.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                if (file.size > 1024 * 1024) {
                    alert('Image is too large. Please select an image under 1MB.');
                    this.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('set-shop-logo').value = e.target.result;
                    document.getElementById('logo-preview').src = e.target.result;
                    document.getElementById('logo-preview-container').style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    window.removeLogo = function() {
        document.getElementById('set-shop-logo').value = '';
        document.getElementById('set-shop-logo-upload').value = '';
        document.getElementById('logo-preview-container').style.display = 'none';
    };

    // AMC Quick Actions
    window.setQuickAMC = function(planName, days) {
        let baseDate = new Date();
        if (amcData && amcData.expiryDate) {
            const currentExpiry = new Date(amcData.expiryDate);
            if (currentExpiry > baseDate) {
                baseDate = currentExpiry;
            }
        }
        baseDate.setDate(baseDate.getDate() + days);
        
        const yyyy = baseDate.getFullYear();
        const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
        const dd = String(baseDate.getDate()).padStart(2, '0');
        const newExpiryStr = `${yyyy}-${mm}-${dd}`;
        
        document.getElementById('set-amc-plan').value = planName;
        document.getElementById('set-amc-expiry').value = newExpiryStr;
        document.getElementById('set-amc-contact').value = '9360039283';
    };

    // AMC Form
    const amcForm = document.getElementById('amc-form');
    if (amcForm) {
        amcForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const branchSelect = document.getElementById('amc-target-branch');
            const targetBranchId = branchSelect ? branchSelect.value : 'all';

            if (!amcData || typeof amcData !== 'object') amcData = {};
            if (!amcData.branches) amcData.branches = {};

            const planName = document.getElementById('set-amc-plan').value;
            const expiryDate = document.getElementById('set-amc-expiry').value;
            const contactInfo = document.getElementById('set-amc-contact').value;

            if (targetBranchId === 'all') {
                amcData.planName = planName;
                amcData.expiryDate = expiryDate;
                amcData.contactInfo = contactInfo;

                (branches || []).forEach(b => {
                    amcData.branches[b.id] = {
                        planName,
                        expiryDate,
                        contactInfo,
                        isLocked: (amcData.branches[b.id] && amcData.branches[b.id].isLocked) || false
                    };
                });
            } else {
                amcData.branches[targetBranchId] = {
                    planName,
                    expiryDate,
                    contactInfo,
                    isLocked: (amcData.branches[targetBranchId] && amcData.branches[targetBranchId].isLocked) || false
                };
            }

            localStorage.setItem('mediflow_amc', JSON.stringify(amcData));
            if (typeof syncToCloud === 'function') syncToCloud('amc', amcData);

            alert(`AMC Subscription Details Saved for Branch (${targetBranchId})!`);
            onAMCBranchSelectChange();
            checkAMCStatus();
            if (typeof renderBranches === 'function') renderBranches();
        });
    }

    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();

        const loggedInUser = sessionStorage.getItem('mediflow_user');
        const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
        const isSuperAdmin = !loggedInUser || loggedInUser === 'VIKI' || (loggedInUser && loggedInUser.toLowerCase() === 'viki') || userRole === 'super_admin' || userRole === 'Super Admin';

        let gstDefault = document.getElementById('set-gst-default').checked;
        let kotEnabled = document.getElementById('set-kot-enabled') ? document.getElementById('set-kot-enabled').checked : true;
        let enableTableMgmt = document.getElementById('set-enable-table-mgmt') ? document.getElementById('set-enable-table-mgmt').checked : false;
        let enableTableQr = document.getElementById('set-enable-table-qr') ? document.getElementById('set-enable-table-qr').checked : true;
        let enableWaiterSelect = document.getElementById('set-enable-waiter') ? document.getElementById('set-enable-waiter').checked : false;
        let enableDoctorSelect = document.getElementById('set-enable-doctor') ? document.getElementById('set-enable-doctor').checked : false;
        let enableMenuCard = document.getElementById('set-enable-menu-card') ? document.getElementById('set-enable-menu-card').checked : true;
        let enableDigitalOrders = document.getElementById('set-enable-digital-orders') ? document.getElementById('set-enable-digital-orders').checked : true;
        let enableCustomCakeOrders = document.getElementById('set-enable-custom-cake-orders') ? document.getElementById('set-enable-custom-cake-orders').checked : true;

        if (!isSuperAdmin) {
            gstDefault = settings.gstDefault !== undefined ? settings.gstDefault : true;
            kotEnabled = settings.kotEnabled !== undefined ? settings.kotEnabled : true;
            enableTableMgmt = settings.enableTableMgmt !== undefined ? settings.enableTableMgmt : false;
            enableTableQr = settings.enableTableQr !== undefined ? settings.enableTableQr : true;
            enableWaiterSelect = settings.enableWaiterSelect !== undefined ? settings.enableWaiterSelect : false;
            enableDoctorSelect = settings.enableDoctorSelect !== undefined ? settings.enableDoctorSelect : false;
            enableMenuCard = settings.enableMenuCard !== undefined ? settings.enableMenuCard : true;
            enableDigitalOrders = settings.enableDigitalOrders !== undefined ? settings.enableDigitalOrders : true;
            enableCustomCakeOrders = settings.enableCustomCakeOrders !== undefined ? settings.enableCustomCakeOrders : true;
        }

        settings = {
            shopName: document.getElementById('set-shop-name').value,
            shopAddress: document.getElementById('set-shop-address').value,
            shopPhone: document.getElementById('set-shop-phone').value,
            shopGstin: document.getElementById('set-shop-gstin') ? document.getElementById('set-shop-gstin').value : '',
            shopLogo: document.getElementById('set-shop-logo').value,
            shopUpi: document.getElementById('set-shop-upi') ? document.getElementById('set-shop-upi').value : '',
            printerType: document.getElementById('set-printer-type').value,
            printerName: document.getElementById('set-printer-name') ? document.getElementById('set-printer-name').value.trim() : 'Default System Printer',
            printCopies: document.getElementById('set-print-copies') ? Number(document.getElementById('set-print-copies').value) : 1,
            gstDefault,
            kotEnabled,
            enableWaiterSelect,
            enableDoctorSelect,
            enableTableMgmt,
            enableTableQr,
            enableMenuCard,
            enableDigitalOrders,
            enableCustomCakeOrders,
            printMode: document.getElementById('set-print-mode') ? document.getElementById('set-print-mode').value : 'preview',
            currency: document.getElementById('set-currency').value
        };
        localStorage.setItem('mediflow_settings', JSON.stringify(settings));
        alert('Settings saved successfully!');
        initApp(); // Refresh to apply changes
    });

    // Purchase Form
    document.getElementById('purchase-form').addEventListener('submit', handlePurchaseSubmit);
    
    // Expense Form
    document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);

    // Admin Form
    document.getElementById('admin-form').addEventListener('submit', handleAdminSubmit);

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to logout?')) {
            // Avoid manual export if auto-backup is configured
            try { 
                const hasBackupDir = await getBackupDirHandle();
                if (!hasBackupDir) {
                    exportData(); 
                }
            } catch(e) {}

            try { await printShiftSummaryReceipt('LOGOUT'); } catch(e) {}
            
            setTimeout(() => {
                sessionStorage.removeItem('mediflow_logged_in');
                sessionStorage.removeItem('mediflow_user');
                checkLoginStatus();
            }, 500);
        }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        // Menu shortcuts (Alt + Key)
        if (e.altKey) {
            switch(e.key.toLowerCase()) {
                case 'd': e.preventDefault(); switchSection('dashboard'); break;
                case 'b': e.preventDefault(); switchSection('billing'); break;
                case 'p': e.preventDefault(); switchSection('products'); break;
                case 'u': e.preventDefault(); switchSection('purchase'); break;
                case 'i': e.preventDefault(); switchSection('stock-in'); break;
                case 'e': e.preventDefault(); switchSection('expenses'); break;
                case 'c': e.preventDefault(); switchSection('customers'); break;
                case 's': e.preventDefault(); switchSection('suppliers'); break;
                case 'h': e.preventDefault(); switchSection('sales'); break;
                case 'o': e.preventDefault(); switchSection('digital-orders'); break;
                case 'a': e.preventDefault(); switchSection('users'); break;
                case 't': e.preventDefault(); switchSection('settings'); break;
                case 'w': e.preventDefault(); switchSection('staff-management'); break;
                case 'l': e.preventDefault(); switchSection('barcode-labels'); break;
                case 'n': 
                    e.preventDefault();
                    if (activeSection === 'products') openProductModal();
                    else if (activeSection === 'customers') openCustomerModal();
                    else if (activeSection === 'suppliers') openSupplierModal();
                    break;
                case 'o':
                    if (activeSection === 'billing') {
                        e.preventDefault();
                        if (typeof holdCurrentCart === 'function') holdCurrentCart();
                    }
                    break;
                case 'x':
                    if (activeSection === 'billing') {
                        e.preventDefault();
                        if (typeof clearCart === 'function') clearCart();
                    }
                    break;
                case 'k':
                    if (activeSection === 'billing') {
                        e.preventDefault();
                        if (typeof printKOT === 'function') printKOT();
                    }
                    break;
                case '1':
                    if (activeSection === 'billing') {
                        e.preventDefault();
                        const btn = document.querySelector('[data-mode="Cash"]');
                        if (btn && typeof setPayMode === 'function') setPayMode('Cash', btn);
                    }
                    break;
                case '2':
                    if (activeSection === 'billing') {
                        e.preventDefault();
                        const btn = document.querySelector('[data-mode="GPay"]');
                        if (btn && typeof setPayMode === 'function') setPayMode('GPay', btn);
                    }
                    break;
                case '3':
                    if (activeSection === 'billing') {
                        e.preventDefault();
                        const btn = document.querySelector('[data-mode="Credit"]');
                        if (btn && typeof setPayMode === 'function') setPayMode('Credit', btn);
                    }
                    break;
            }
        }

        if (e.key === 'F2') { e.preventDefault(); switchSection('billing'); }
        if (e.key === 'F4') { e.preventDefault(); switchSection('products'); }
        
        if (activeSection === 'billing') {
            if ((e.ctrlKey && e.key === 'Enter') || e.key === 'F9' || e.key === 'F8' || e.key === 'End') {
                e.preventDefault();
                processSale(true);
            }
            if (e.key === 'Escape') {
                document.getElementById('search-results').style.display = 'none';
                const billingSearch = document.getElementById('billing-search');
                if (billingSearch) billingSearch.blur();
            }
        }
    });

    // Sales History Export
    const exportSalesBtn = document.getElementById('export-sales');
    if (exportSalesBtn) exportSalesBtn.addEventListener('click', exportData);
    // Export/Import Data
    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', exportData);

    const importDataBtn = document.getElementById('import-data-btn');
    if (importDataBtn) importDataBtn.addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    
    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) importFileInput.addEventListener('change', importData);

    // Product specific Export/Import & CSV Sample Template
    const importProdBtn = document.getElementById('import-products-btn');
    if (importProdBtn) importProdBtn.addEventListener('click', () => {
        const input = document.getElementById('product-import-input');
        if (input) input.click();
    });

    const prodImportInput = document.getElementById('product-import-input');
    if (prodImportInput) prodImportInput.addEventListener('change', importProducts);

    // Close search results on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            document.getElementById('search-results').style.display = 'none';
        }
    });
}

// --- Theme Logic ---
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('mediflow_theme', currentTheme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    icon.setAttribute('data-lucide', currentTheme === 'light' ? 'moon' : 'sun');
    lucide.createIcons();
}

// --- CSV Sample Template, Export & Import ---
function downloadSampleCSVTemplate() {
    const headers = [
        "Product Name",
        "Category",
        "Unit",
        "Sales Unit",
        "HSN Code",
        "Batch Number",
        "Expiry Date (YYYY-MM-DD)",
        "MRP",
        "Sale Price",
        "Stock Quantity",
        "Barcode",
        "GST %"
    ];

    const sampleRows = [
        [
            "Paracetamol 650mg",
            "Tablet",
            "pcs",
            "pcs",
            "3004",
            "BATCH101",
            "2027-12-31",
            "30.00",
            "25.00",
            "100",
            "8901234567890",
            "12"
        ],
        [
            "Basmati Rice",
            "Grocery",
            "kg",
            "grm",
            "1006",
            "B2026",
            "2028-06-30",
            "160.00",
            "140.00",
            "50",
            "8909876543210",
            "5"
        ],
        [
            "Refined Sunflower Oil",
            "Grocery",
            "ltr",
            "ml",
            "1512",
            "B3099",
            "2027-09-30",
            "180.00",
            "160.00",
            "20",
            "8905555444333",
            "5"
        ],
        [
            "Biscuit Family Pack",
            "Snacks",
            "pkg",
            "pkg",
            "1905",
            "PK99",
            "2026-11-30",
            "60.00",
            "50.00",
            "30",
            "8901111222333",
            "18"
        ]
    ];

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

    sampleRows.forEach(row => {
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "T7_BillPro_Product_Import_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportProductsCSV() {
    if (products.length === 0) {
        alert("No products available to export!");
        return;
    }

    const headers = [
        "Product Name",
        "Category",
        "Unit",
        "Sales Unit",
        "HSN Code",
        "Batch Number",
        "Expiry Date",
        "MRP",
        "Sale Price",
        "Stock Quantity",
        "Barcode",
        "GST %"
    ];

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";

    products.forEach(p => {
        const row = [
            p.name || '',
            p.category || 'General',
            p.unit || 'pcs',
            p.saleUnit || p.unit || 'pcs',
            p.hsn || '',
            p.batch || '',
            p.expiry || '',
            p.mrp || 0,
            p.salePrice || 0,
            p.stock || 0,
            p.barcode || '',
            p.gst || 0
        ];
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Products_Export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function parseImportDate(rawDate) {
    if (!rawDate) return new Date(Date.now() + 31536000000).toISOString().split('T')[0];
    const s = String(rawDate).trim();
    if (!s) return new Date(Date.now() + 31536000000).toISOString().split('T')[0];

    // Already YYYY-MM-DD
    if (/^\d{4}[-\/. ]\d{1,2}[-\/. ]\d{1,2}$/.test(s)) {
        const parts = s.split(/[-\/. ]/);
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
    if (/^\d{1,2}[-\/. ]\d{1,2}[-\/. ]\d{4}$/.test(s)) {
        const parts = s.split(/[-\/. ]/);
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        return `${y}-${m}-${d}`;
    }

    // Fallback JavaScript Date parse
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
        return dObj.toISOString().split('T')[0];
    }

    return new Date(Date.now() + 31536000000).toISOString().split('T')[0];
}
function parseImportStock(rawStock) {
    if (rawStock === undefined || rawStock === null || rawStock === '') return 0;
    const str = String(rawStock).trim().toLowerCase();
    
    if (str === 'infinity' || str === 'inf' || str === '∞' || str === 'unlimited' || str === '-1') {
        return 999999;
    }
    
    const parsed = parseFloat(str);
    if (isNaN(parsed)) return 0;
    if (parsed >= 999999 || parsed === Infinity || parsed < 0) return 999999;
    
    return parsed;
}
window.parseImportStock = parseImportStock;

function importProducts(e) {
    const file = e.target.files[0];
    if (!file) return;

    const getStr = (val) => (val !== undefined && val !== null) ? String(val).trim() : '';

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            let content = event.target.result;
            if (content.charCodeAt(0) === 0xFEFF) {
                content = content.slice(1);
            }

            let count = 0;

            if (file.name.endsWith('.json')) {
                const parsed = JSON.parse(content);
                const items = Array.isArray(parsed) ? parsed : (parsed.products || parsed.data || []);
                if (Array.isArray(items) && items.length > 0) {
                    items.forEach((p, idx) => {
                        const name = getStr(p.name || p.productName || p.title || p.itemName);
                        if (name) {
                            const cat = getStr(p.category || p.categoryName || p.group || p.type) || 'General';
                            const barcode = getStr(p.barcode || p.code || p.bar_code || p.barcodeNo || p.upc || p.ean);
                            
                            if (cat && typeof ensureCategoryExists === 'function') {
                                ensureCategoryExists(cat);
                            }

                            const existingIdx = products.findIndex(ep => 
                                (ep.name && ep.name.trim().toLowerCase() === name.trim().toLowerCase()) &&
                                (ep.batch && ep.batch.trim().toLowerCase() === getStr(p.batch || 'GEN').toLowerCase())
                            );

                            const pObj = {
                                id: existingIdx >= 0 ? products[existingIdx].id : (p.id || ('P' + Date.now() + Math.random().toString().slice(-4) + idx)),
                                name: name,
                                barcode: barcode || (existingIdx >= 0 ? products[existingIdx].barcode : ''),
                                category: cat,
                                unit: (getStr(p.unit) || 'pcs').toLowerCase(),
                                saleUnit: (getStr(p.saleUnit) || getStr(p.unit) || 'pcs').toLowerCase(),
                                hsn: getStr(p.hsn) || (existingIdx >= 0 ? products[existingIdx].hsn : ''),
                                batch: getStr(p.batch) || 'GEN',
                                expiry: parseImportDate(p.expiry),
                                mrp: parseFloat(p.mrp) || 0,
                                salePrice: parseFloat(p.salePrice) || parseFloat(p.mrp) || 0,
                                stock: parseImportStock(p.stock),
                                gst: parseFloat(p.gst) || 0
                            };

                            if (existingIdx >= 0) {
                                products[existingIdx] = pObj;
                            } else {
                                products.push(pObj);
                            }
                            count++;
                        }
                    });
                }
            } else {
                // CSV Parsing with BOM stripping, empty line protection & robust column mapping
                const rawLines = content.split(/\r\n|\n|\r/);
                const lines = rawLines.filter(l => l.replace(/[,; "'\t\ufeff]/g, '').trim().length > 0);

                if (lines.length > 0) {
                    const firstLineCols = parseCSVLine(lines[0]);
                    const sampleDataRow = lines.length > 1 ? parseCSVLine(lines[1]) : firstLineCols;
                    
                    const isHeader = firstLineCols.some(c => {
                        const clean = String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
                        return /product|itemname|itemcode|cat|group|hsn|batch|exp|mrp|saleprice|rate|stock|qty|barcode|gst|tax/i.test(clean);
                    });

                    let colMap = {
                        name: 0,
                        category: 1,
                        unit: 2,
                        saleUnit: 3,
                        hsn: 4,
                        batch: 5,
                        expiry: 6,
                        mrp: 7,
                        salePrice: 8,
                        stock: 9,
                        barcode: 10,
                        gst: 11
                    };

                    if (isHeader) {
                        firstLineCols.forEach((colName, index) => {
                            const cClean = String(colName).toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (!cClean) return;

                            if (cClean.includes('category') || cClean.includes('group') || cClean === 'cat' || cClean === 'type' || cClean === 'department' || cClean === 'grp') {
                                colMap.category = index;
                            } else if (cClean.includes('gst') || cClean.includes('tax') || cClean.includes('vat')) {
                                colMap.gst = index;
                            } else if (cClean.includes('barcode') || cClean.includes('barcodeno') || cClean === 'upc' || cClean === 'ean' || cClean === 'itemcode' || cClean === 'productcode') {
                                colMap.barcode = index;
                            } else if (cClean.includes('productname') || cClean.includes('itemname') || cClean === 'name' || cClean === 'product' || cClean === 'item' || cClean === 'title') {
                                colMap.name = index;
                            } else if (cClean.includes('salesunit') || cClean.includes('saleunit')) {
                                colMap.saleUnit = index;
                            } else if (cClean.includes('unit') || cClean.includes('pkg')) {
                                colMap.unit = index;
                            } else if (cClean.includes('hsn') || cClean.includes('sac')) {
                                colMap.hsn = index;
                            } else if (cClean.includes('batch') || cClean.includes('lot')) {
                                colMap.batch = index;
                            } else if (cClean.includes('exp')) {
                                colMap.expiry = index;
                            } else if (cClean.includes('mrp')) {
                                colMap.mrp = index;
                            } else if (cClean.includes('saleprice') || cClean.includes('selling') || cClean.includes('sale') || cClean.includes('price') || cClean.includes('rate')) {
                                colMap.salePrice = index;
                            } else if (cClean.includes('stock') || cClean.includes('qty') || cClean.includes('quantity') || cClean.includes('balance') || cClean.includes('opening')) {
                                colMap.stock = index;
                            } else if (cClean === 'code' || cClean === 'bar') {
                                colMap.barcode = index;
                            }
                        });
                    } else if (sampleDataRow && sampleDataRow.length > 0) {
                        const val9 = parseFloat(sampleDataRow[9]);
                        const val10 = parseFloat(sampleDataRow[10]);
                        const val11 = parseFloat(sampleDataRow[11]);

                        if (!isNaN(val9) && [0, 5, 12, 18, 28].includes(val9) && (!isNaN(val10) && val10 > 28)) {
                            colMap.gst = 9;
                            colMap.stock = 10;
                            colMap.barcode = 11;
                        } else if (!isNaN(val11) && [0, 5, 12, 18, 28].includes(val11)) {
                            colMap.stock = 9;
                            colMap.barcode = 10;
                            colMap.gst = 11;
                        }
                    }

                    const startIdx = isHeader ? 1 : 0;
                    for (let i = startIdx; i < lines.length; i++) {
                        const cols = parseCSVLine(lines[i]);
                        if (cols.length === 0) continue;

                        let name = getStr(cols[colMap.name]);
                        if (!name) {
                            const nonEmp = cols.find(c => getStr(c).length > 0);
                            if (nonEmp) name = getStr(nonEmp);
                            else continue;
                        }

                        const category = getStr(cols[colMap.category]) || 'General';
                        const barcode = getStr(cols[colMap.barcode]);
                        const rawUnit = getStr(cols[colMap.unit]).toLowerCase();
                        const unit = ['kg', 'grm', 'ltr', 'ml', 'pkg', 'plate', 'strip', 'pcs'].includes(rawUnit) ? rawUnit : 'pcs';
                        const rawSaleUnit = getStr(cols[colMap.saleUnit]).toLowerCase();
                        const saleUnit = ['kg', 'grm', 'ltr', 'ml', 'pkg', 'plate', 'strip', 'pcs'].includes(rawSaleUnit) ? rawSaleUnit : unit;
                        
                        const hsn = getStr(cols[colMap.hsn]);
                        const batch = getStr(cols[colMap.batch]) || 'GEN';
                        const expiry = parseImportDate(cols[colMap.expiry]);

                        const mrp = parseFloat(cols[colMap.mrp]) || 0;
                        const salePrice = parseFloat(cols[colMap.salePrice]) || mrp;
                        const stock = parseImportStock(cols[colMap.stock]);
                        const gst = parseFloat(cols[colMap.gst]) || 0;

                        if (category && typeof ensureCategoryExists === 'function') {
                            ensureCategoryExists(category);
                        }

                        const existingIdx = products.findIndex(ep => 
                            ep.name && ep.name.trim().toLowerCase() === name.trim().toLowerCase()
                        );

                        const productObj = {
                            id: existingIdx >= 0 ? products[existingIdx].id : ('P' + Date.now() + Math.floor(Math.random() * 1000) + i),
                            name: name,
                            barcode: barcode !== '' ? barcode : (existingIdx >= 0 ? (products[existingIdx].barcode || '') : ''),
                            category: category,
                            unit: unit,
                            saleUnit: saleUnit,
                            hsn: hsn || (existingIdx >= 0 ? (products[existingIdx].hsn || '') : ''),
                            batch: batch,
                            expiry: expiry,
                            mrp: mrp > 0 ? mrp : (existingIdx >= 0 ? products[existingIdx].mrp : 0),
                            salePrice: salePrice > 0 ? salePrice : (existingIdx >= 0 ? products[existingIdx].salePrice : mrp),
                            stock: stock,
                            gst: gst
                        };

                        if (existingIdx >= 0) {
                            products[existingIdx] = productObj;
                        } else {
                            products.push(productObj);
                        }
                        count++;
                    }
                }
            }

            if (count > 0) {
                // Deduplicate any legacy duplicates by name to ensure clean table rendering
                const nameMap = {};
                const deduplicated = [];
                products.forEach(p => {
                    const norm = (p.name || '').trim().toLowerCase();
                    if (!norm) return;
                    if (nameMap[norm]) {
                        const existing = nameMap[norm];
                        if (!existing.barcode && p.barcode) existing.barcode = p.barcode;
                        if ((!existing.stock || existing.stock < 999999) && p.stock >= 999999) existing.stock = p.stock;
                        if (p.expiry) existing.expiry = p.expiry;
                        if (p.batch) existing.batch = p.batch;
                        if (p.category) existing.category = p.category;
                        if (p.mrp > 0) existing.mrp = p.mrp;
                        if (p.salePrice > 0) existing.salePrice = p.salePrice;
                    } else {
                        nameMap[norm] = { ...p };
                        deduplicated.push(nameMap[norm]);
                    }
                });
                products = deduplicated;

                if (typeof ensureAllCategoriesFromProducts === 'function') {
                    ensureAllCategoriesFromProducts();
                }
                saveAndRefresh();
                alert(`Successfully imported ${count} product(s)! Categories & Barcodes updated.`);
            } else {
                alert('No valid product data found in the imported file.');
            }
        } catch (err) {
            console.error('Failed to import products:', err);
            alert('Error reading imported file: ' + err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function parseCSVLine(line) {
    if (!line) return [];
    let s = String(line);
    if (s.charCodeAt(0) === 0xFEFF) {
        s = s.slice(1);
    }
    let delimiter = ',';
    if (s.includes(';') && (s.split(';').length > s.split(',').length)) {
        delimiter = ';';
    } else if (s.includes('\t') && (s.split('\t').length > s.split(',').length)) {
        delimiter = '\t';
    }

    const cols = [];
    let insideQuote = false;
    let currentVal = '';
    for (let j = 0; j < s.length; j++) {
        const char = s[j];
        if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === delimiter && !insideQuote) {
            cols.push(currentVal.trim().replace(/^"|"$/g, ''));
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    cols.push(currentVal.trim().replace(/^"|"$/g, ''));
    return cols;
}

function formatPrintQty(item) {
    const unit = (item.saleUnit || item.unit || '').trim();
    if (!unit) return `${item.qty}`;
    
    let unitDisplay = unit;
    if (unit.toLowerCase() === 'kg') unitDisplay = 'Kg';
    else if (unit.toLowerCase() === 'grm') unitDisplay = 'grm';
    else if (unit.toLowerCase() === 'ltr') unitDisplay = 'Ltr';
    else if (unit.toLowerCase() === 'ml') unitDisplay = 'ml';
    else if (unit.toLowerCase() === 'pcs') unitDisplay = 'Pcs';
    else unitDisplay = unit.charAt(0).toUpperCase() + unit.slice(1);

    return `${item.qty} ${unitDisplay}`;
}

function formatPrintRate(item) {
    const priceStr = parseFloat(item.salePrice || 0).toFixed(2);
    let baseUnit = (item.unit || item.saleUnit || '').trim();
    if (!baseUnit) return priceStr;

    let unitDisplay = baseUnit;
    if (baseUnit.toLowerCase() === 'kg' || item.saleUnit === 'grm') unitDisplay = 'Kg';
    else if (baseUnit.toLowerCase() === 'ltr' || item.saleUnit === 'ml') unitDisplay = 'Ltr';
    else if (baseUnit.toLowerCase() === 'pcs') unitDisplay = 'Pcs';
    else unitDisplay = baseUnit.charAt(0).toUpperCase() + baseUnit.slice(1);

    return `${priceStr} / ${unitDisplay}`;
}

function getItemLineTotal(item) {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.salePrice) || 0;
    const saleUnit = item.saleUnit || item.unit || 'pcs';

    if (saleUnit === 'grm') {
        return (qty / 1000) * price;
    } else if (saleUnit === 'ml') {
        return (qty / 1000) * price;
    }
    return qty * price;
}

function getItemStockDeduction(item) {
    const qty = parseFloat(item.qty) || 0;
    const saleUnit = item.saleUnit || item.unit || 'pcs';

    if (saleUnit === 'grm') {
        return qty / 1000;
    } else if (saleUnit === 'ml') {
        return qty / 1000;
    }
    return qty;
}

function updateSalesUnitOptions() {
    const unitSelect = document.getElementById('p-unit');
    const salesUnitSelect = document.getElementById('p-sales-unit');
    if (!unitSelect || !salesUnitSelect) return;

    const val = unitSelect.value;
    let options = '';
    if (val === 'kg') {
        options = '<option value="kg">Kg (Kilogram)</option><option value="grm" selected>grm (Gram)</option>';
    } else if (val === 'ltr') {
        options = '<option value="ltr">Ltr (Liter)</option><option value="ml" selected>ml (Milliliter)</option>';
    } else if (val === 'pkg') {
        options = '<option value="pkg" selected>Pkg (Package)</option>';
    } else if (val === 'plate') {
        options = '<option value="plate" selected>Plate</option>';
    } else if (val === 'strip') {
        options = '<option value="strip" selected>Strip</option>';
    } else {
        options = '<option value="pcs" selected>Pcs (Pieces)</option>';
    }
    salesUnitSelect.innerHTML = options;
}

// --- Product Management ---
// --- Product Management ---
function renderProducts() {
    try {
        const tbody = document.querySelector('#products-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const loggedInUser = sessionStorage.getItem('mediflow_user');
        const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
        const isSuperAdmin = loggedInUser && (loggedInUser === 'VIKI' || loggedInUser.toLowerCase() === 'viki' || userRole === 'super_admin' || userRole === 'Super Admin' || loggedInUser === 'superadmin' || loggedInUser === 'admin');

        const delAllBtn = document.getElementById('delete-all-branch-products-btn');
        if (delAllBtn) {
            delAllBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
        }

        const searchInput = document.getElementById('product-list-search');
        const query = searchInput ? searchInput.value.toLowerCase() : '';

        let filtered = [...products];
        if (query) {
            filtered = filtered.filter(p => 
                (p.name && p.name.toLowerCase().includes(query)) || 
                (p.barcode && String(p.barcode).toLowerCase().includes(query)) || 
                (p.batch && String(p.batch).toLowerCase().includes(query)) ||
                (p.category && String(p.category).toLowerCase().includes(query))
            );
        }

        const sortSelect = document.getElementById('product-list-sort');
        const sortMode = sortSelect ? sortSelect.value : 'default';
        
        if (sortMode !== 'default') {
            filtered.sort((a, b) => {
                if (sortMode === 'name_asc') return (a.name || '').localeCompare(b.name || '');
                if (sortMode === 'name_desc') return (b.name || '').localeCompare(a.name || '');
                if (sortMode === 'category_asc') return (a.category || '').localeCompare(b.category || '');
                if (sortMode === 'category_desc') return (b.category || '').localeCompare(a.category || '');
                if (sortMode === 'price_asc') return (parseFloat(a.salePrice) || 0) - (parseFloat(b.salePrice) || 0);
                if (sortMode === 'price_desc') return (parseFloat(b.salePrice) || 0) - (parseFloat(a.salePrice) || 0);
                return 0;
            });
        }

        let htmlRows = '';
        filtered.forEach(p => {
            const parsedExpiry = parseImportDate(p.expiry);
            const isExpired = new Date(parsedExpiry) < new Date();
            const isLowStock = p.stock <= 10 && p.stock < 999999;
            const displayStock = p.stock >= 999999 ? '∞' : p.stock;
            const unitDisplay = (p.unit || 'pcs').toUpperCase();
            const barcodeDisplay = (p.barcode || p.code || p.bar_code || '').trim();

            htmlRows += `<tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${p.imageUrl ? `<img src="${p.imageUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;">` : ''}
                        <strong>${p.name}</strong>
                    </div>
                </td>
                <td>${barcodeDisplay ? `<span class="badge" style="background: #f1f5f9; color: #334155; font-family: monospace; font-weight: 600;"><i data-lucide="barcode" style="width: 13px; height: 13px; vertical-align: middle;"></i> ${barcodeDisplay}</span>` : '<span style="color: #94a3b8;">-</span>'}</td>
                <td><span class="badge" style="background: #e2e8f0; color: #475569;">${p.category || 'General'}</span></td>
                <td><span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 600;">${unitDisplay}</span></td>
                <td>${p.hsn || '-'}</td>
                <td>${p.batch || '-'}</td>
                <td>
                    <span class="badge ${isExpired ? 'badge-danger' : (isNearExpiry(parsedExpiry) ? 'badge-warning' : 'badge-success')}">
                        ${parsedExpiry}
                    </span>
                </td>
                <td>${settings.currency}${p.mrp}</td>
                <td>${settings.currency}${p.salePrice} / ${p.unit || 'pcs'}</td>
                <td>
                    <span class="badge ${isLowStock ? 'badge-danger' : 'badge-success'}">
                        ${displayStock} ${p.unit || 'pcs'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-primary" onclick="addToCartAndSwitch('${p.id}')" style="padding: 5px; background: var(--secondary-color);"><i data-lucide="shopping-cart" style="width: 16px;"></i></button>
                    <button class="btn btn-outline" onclick="editProduct('${p.id}')" style="padding: 5px;"><i data-lucide="edit-2" style="width: 16px;"></i></button>
                    ${isSuperAdmin ? `<button class="btn btn-outline" onclick="deleteProduct('${p.id}')" style="padding: 5px; color: var(--danger-color);"><i data-lucide="trash" style="width: 16px;"></i></button>` : ''}
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlRows;

        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">No products found in cloud or local. Click "Add New Product" to start.</td></tr>';
        }
        lucide.createIcons();
    } catch (e) {
        console.error('Error rendering products:', e);
    }
}

function deleteAllBranchProducts() {
    const loggedInUser = sessionStorage.getItem('mediflow_user');
    const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
    const isSuperAdmin = loggedInUser && (loggedInUser === 'VIKI' || loggedInUser.toLowerCase() === 'viki' || userRole === 'super_admin' || userRole === 'Super Admin' || loggedInUser === 'superadmin' || loggedInUser === 'admin');

    if (!isSuperAdmin) {
        alert("🔒 Only Super Admin can delete all branch products!");
        return;
    }

    if (!products || products.length === 0) {
        alert("There are no products in this branch to delete.");
        return;
    }

    const branchName = currentBranchId || 'Active Branch';
    const count = products.length;
    const confirmMessage = `⚠️ SUPER ADMIN WARNING:\n\nAre you sure you want to PERMANENTLY DELETE ALL ${count} products from Branch (${branchName})?\n\nThis will wipe out all product inventory for this branch and CANNOT be undone!`;
    
    if (confirm(confirmMessage)) {
        const doubleConfirm = prompt(`Type DELETE to confirm wiping all ${count} products for Branch (${branchName}):`);
        if (doubleConfirm && doubleConfirm.trim().toUpperCase() === 'DELETE') {
            products = [];
            localStorage.setItem('mediflow_products', JSON.stringify(products));
            if (typeof syncToCloud === 'function') {
                syncToCloud('products', products);
            }
            renderProducts();
            if (typeof renderCartProducts === 'function') renderCartProducts();
            alert(`✅ All products for Branch (${branchName}) have been permanently deleted.`);
        } else {
            alert("Deletion cancelled. Products were not modified.");
        }
    }
}
window.deleteAllBranchProducts = deleteAllBranchProducts;

function addToCartAndSwitch(id) {
    addToCart(id);
    switchSection('billing');
}

function handleProductImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file (JPG, PNG, WEBP).');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 350;

            if (width > height) {
                if (width > maxDim) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);

            const urlInput = document.getElementById('p-image-url');
            const preview = document.getElementById('p-image-preview');
            const icon = document.getElementById('p-image-placeholder-icon');
            const clearBtn = document.getElementById('p-image-clear-btn');

            if (urlInput) urlInput.value = compressedBase64;
            if (preview) {
                preview.src = compressedBase64;
                preview.style.display = 'block';
            }
            if (icon) icon.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'inline-block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearProductImagePreview() {
    const fileInput = document.getElementById('p-image-file');
    const urlInput = document.getElementById('p-image-url');
    const preview = document.getElementById('p-image-preview');
    const icon = document.getElementById('p-image-placeholder-icon');
    const clearBtn = document.getElementById('p-image-clear-btn');

    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (icon) icon.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'none';
}

function openProductModal(id = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('modal-title');
    
    form.reset();
    document.getElementById('edit-id').value = '';

    if (id) {
        const p = products.find(prod => prod.id === id);
        title.textContent = 'Edit Product';
        document.getElementById('edit-id').value = p.id;
        document.getElementById('p-name').value = p.name || '';
        
        const barcodeVal = (p.barcode || p.code || p.bar_code || p.barcodeNo || p.upc || p.ean || '').trim();
        document.getElementById('p-barcode').value = barcodeVal;

        if (p.category) {
            ensureCategoryExists(p.category);
        }
        updateCategoryDropdowns();

        const pCatSelect = document.getElementById('p-category');
        if (pCatSelect && p.category) {
            pCatSelect.value = p.category;
            if (!pCatSelect.value || pCatSelect.value !== p.category) {
                const matchOpt = Array.from(pCatSelect.options).find(opt => opt.value.toLowerCase() === p.category.toLowerCase());
                if (matchOpt) pCatSelect.value = matchOpt.value;
            }
        }
        
        const unitEl = document.getElementById('p-unit');
        if (unitEl) unitEl.value = p.unit || 'pcs';
        updateSalesUnitOptions();
        const salesUnitEl = document.getElementById('p-sales-unit');
        if (salesUnitEl) salesUnitEl.value = p.saleUnit || p.unit || 'pcs';

        document.getElementById('p-hsn').value = p.hsn;
        document.getElementById('p-batch').value = p.batch;
        document.getElementById('p-expiry').value = p.expiry;
        document.getElementById('p-mrp').value = p.mrp;
        document.getElementById('p-sale-price').value = p.salePrice;
        document.getElementById('p-stock').value = p.stock;
        document.getElementById('p-gst').value = p.gst;

        const imgVal = p.imageUrl || p.image || '';
        const urlInput = document.getElementById('p-image-url');
        const preview = document.getElementById('p-image-preview');
        const icon = document.getElementById('p-image-placeholder-icon');
        const clearBtn = document.getElementById('p-image-clear-btn');
        if (urlInput) urlInput.value = imgVal;
        if (preview && imgVal) {
            preview.src = imgVal;
            preview.style.display = 'block';
            if (icon) icon.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'inline-block';
        } else {
            clearProductImagePreview();
        }
    } else {
        title.textContent = 'Add New Product';
        const unitEl = document.getElementById('p-unit');
        if (unitEl) unitEl.value = 'pcs';
        updateSalesUnitOptions();
        clearProductImagePreview();
    }

    modal.style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
}

function handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    
    const unitVal = document.getElementById('p-unit') ? document.getElementById('p-unit').value : 'pcs';
    const saleUnitVal = document.getElementById('p-sales-unit') ? document.getElementById('p-sales-unit').value : unitVal;
    const imgUrlVal = document.getElementById('p-image-url') ? document.getElementById('p-image-url').value : '';

    const productData = {
        id: id || 'P' + Date.now(),
        name: document.getElementById('p-name').value,
        barcode: document.getElementById('p-barcode').value,
        category: document.getElementById('p-category').value,
        unit: unitVal,
        saleUnit: saleUnitVal,
        hsn: document.getElementById('p-hsn').value,
        batch: document.getElementById('p-batch').value,
        expiry: document.getElementById('p-expiry').value,
        mrp: parseFloat(document.getElementById('p-mrp').value) || 0,
        salePrice: parseFloat(document.getElementById('p-sale-price').value) || 0,
        stock: parseImportStock(document.getElementById('p-stock').value),
        gst: parseFloat(document.getElementById('p-gst').value) || 0,
        imageUrl: imgUrlVal
    };

    if (id) {
        const index = products.findIndex(p => p.id === id);
        products[index] = productData;
    } else {
        products.push(productData);
    }

    saveAndRefresh();
    closeProductModal();
}

function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        products = products.filter(p => p.id !== id);
        saveAndRefresh();
    }
}

function editProduct(id) {
    openProductModal(id);
}

function ensureCategoryExists(catName) {
    if (!catName) return;
    const trimmed = String(catName).trim();
    if (!isValidCategoryName(trimmed)) return;

    if (!Array.isArray(categories)) categories = [];
    categories = categories.filter(isValidCategoryName);
    const exists = categories.some(c => String(c).trim().toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
        categories.push(trimmed);
        categories = Array.from(new Set(categories.map(c => String(c).trim()).filter(isValidCategoryName)));
        localStorage.setItem('mediflow_categories', JSON.stringify(categories));
        if (typeof renderCategoryManagement === 'function') renderCategoryManagement();
        if (typeof updateCategoryDropdowns === 'function') updateCategoryDropdowns();
        if (typeof syncToCloud === 'function') syncToCloud('categories', categories);
    }
}
window.ensureCategoryExists = ensureCategoryExists;

function ensureAllCategoriesFromProducts() {
    if (!Array.isArray(categories)) categories = [];
    categories = Array.from(new Set(categories.map(c => String(c).trim()).filter(isValidCategoryName)));

    if (Array.isArray(products)) {
        products.forEach(p => {
            if (p.category && String(p.category).trim() !== '') {
                const catClean = String(p.category).trim();
                if (isValidCategoryName(catClean) && !categories.some(c => c.toLowerCase() === catClean.toLowerCase())) {
                    categories.push(catClean);
                }
            }
        });
    }

    categories = categories.filter(isValidCategoryName);
    if (categories.length === 0) categories = ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Ointment', 'Other'];
    localStorage.setItem('mediflow_categories', JSON.stringify(categories));
    if (typeof renderCategoryManagement === 'function') renderCategoryManagement();
    if (typeof updateCategoryDropdowns === 'function') updateCategoryDropdowns();
}
window.ensureAllCategoriesFromProducts = ensureAllCategoriesFromProducts;

function saveAndRefresh() {
    ensureAllCategoriesFromProducts();
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    renderProducts();
    renderDashboard();
    syncToCloud('products', products);
}

function copyProductsFromMainBranch() {
    try {
        let mainProducts = [];
        const defaultBranchData = originalGetItem.call(localStorage, 'mediflow_branch_default_products');
        const legacyData = originalGetItem.call(localStorage, 'mediflow_products');
        
        if (defaultBranchData) {
            mainProducts = JSON.parse(defaultBranchData) || [];
        } else if (legacyData) {
            mainProducts = JSON.parse(legacyData) || [];
        }

        if (!mainProducts || mainProducts.length === 0) {
            alert('No old products found in Main Branch to copy.');
            return;
        }

        let addedCount = 0;
        mainProducts.forEach(mp => {
            const exists = products.some(p => p.id === mp.id || (p.name === mp.name && p.batch === mp.batch));
            if (!exists) {
                products.push(mp);
                addedCount++;
            }
        });

        saveAndRefresh();
        alert(`Successfully imported ${addedCount} product(s) from Main Branch! Total products now: ${products.length}`);
    } catch (e) {
        console.error('Error copying products from main branch:', e);
        alert('Failed to copy products: ' + e.message);
    }
}
window.copyProductsFromMainBranch = copyProductsFromMainBranch;


let searchSelectedIndex = -1;
let customerSearchSelectedIndex = -1;

// --- Billing Logic ---
let lastBillingSearchTime = 0;
let lastBillingSearchLength = 0;

function handleBillingSearch(e) {
    searchSelectedIndex = -1;
    const query = e.target.value.trim().toLowerCase();
    const rawVal = e.target.value;
    const resultsDiv = document.getElementById('search-results');
    
    if (query.length < 1) {
        resultsDiv.style.display = 'none';
        lastBillingSearchTime = Date.now();
        lastBillingSearchLength = 0;
        return;
    }

    const now = Date.now();
    const timeDiff = now - lastBillingSearchTime;
    const lengthDiff = rawVal.length - lastBillingSearchLength;
    lastBillingSearchTime = now;
    lastBillingSearchLength = rawVal.length;

    // Fast scanner input: pasted multi-character input (> 1 char at once) or super fast keystroke sequence (< 40ms apart)
    const isFastInput = lengthDiff > 1 || (timeDiff < 40 && timeDiff > 0);

    // Auto-add on exact barcode match on `input` ONLY for fast hardware scanners / paste.
    // Manual human typing will not be interrupted prematurely when typing longer codes (e.g. typing 44CODE when barcode 4 exists).
    if (isFastInput) {
        const exactMatch = products.find(p => p.barcode && String(p.barcode).trim().toLowerCase() === query);
        if (exactMatch) {
            addToCart(exactMatch.id);
            e.target.value = '';
            resultsDiv.style.display = 'none';
            lastBillingSearchLength = 0;
            return;
        }
    }

    const filtered = products.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) || 
        (p.barcode && String(p.barcode).toLowerCase().includes(query)) ||
        (p.batch && String(p.batch).toLowerCase().includes(query))
    ).slice(0, 5);

    if (filtered.length > 0) {
        resultsDiv.innerHTML = filtered.map(p => `
            <div class="search-item" onclick="addToCart('${p.id}')">
                <span class="name">${p.name} <small>(${p.category || ''})</small></span>
                <span class="details">Barcode: ${p.barcode || 'N/A'} | Batch: ${p.batch || ''} | Price: ${settings.currency}${p.salePrice}</span>
            </div>
        `).join('');
        resultsDiv.style.display = 'block';
    } else {
        resultsDiv.style.display = 'none';
    }
}

function addToCart(productId, inputQty = null) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock <= 0 && product.stock < 999999) {
        alert('Item out of stock!');
        return;
    }

    const defaultUnit = product.saleUnit || product.unit || 'pcs';
    let qty = inputQty;

    if (qty === null) {
        const displayStock = product.stock >= 999999 ? '∞' : `${product.stock} ${product.unit || 'pcs'}`;
        const defaultPromptQty = (defaultUnit === 'grm') ? '250' : ((defaultUnit === 'ml') ? '500' : '1');
        let promptVal = prompt(`Enter quantity (${defaultUnit}) for ${product.name} (Available: ${displayStock}):`, defaultPromptQty);
        if (promptVal === null || promptVal.trim() === '') return;
        let cleanedStr = promptVal.replace(/[^0-9.,]/g, '').replace(',', '.');
        qty = parseFloat(cleanedStr);
        if (isNaN(qty) || qty <= 0) {
            alert('Invalid quantity entered.');
            return;
        }
    }

    const existing = cart.find(item => item.id === productId);
    if (existing) {
        let newQty = existing.qty + qty;
        const deductQty = getItemStockDeduction({ ...existing, qty: newQty });
        if (deductQty > product.stock && product.stock < 999999) {
            alert('Exceeds available stock!');
            return;
        }
        existing.qty = newQty;
    } else {
        cart.push({
            ...product,
            unit: product.unit || 'pcs',
            saleUnit: defaultUnit,
            qty: qty
        });
    }

    playBeep();

    if (document.getElementById('billing-search')) document.getElementById('billing-search').value = '';
    if (document.getElementById('search-results')) document.getElementById('search-results').style.display = 'none';
    renderCart();
}

function renderCart() {
    const tbody = document.querySelector('#cart-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let htmlRows = '';
    cart.forEach((item, index) => {
        const lineTotal = getItemLineTotal(item);

        let unitSelectorHtml = `<span class="badge" style="background: #f1f5f9; color: #334155; font-size: 0.8rem; font-weight: 600;">${(item.saleUnit || item.unit || 'pcs').toUpperCase()}</span>`;
        if (item.unit === 'kg') {
            unitSelectorHtml = `
                <select onchange="updateCartItemUnit(${index}, this.value)" class="form-control" style="padding: 2px 4px; font-size: 0.8rem; width: 68px;">
                    <option value="kg" ${(item.saleUnit === 'kg' || !item.saleUnit) ? 'selected' : ''}>Kg</option>
                    <option value="grm" ${item.saleUnit === 'grm' ? 'selected' : ''}>grm</option>
                </select>
            `;
        } else if (item.unit === 'ltr') {
            unitSelectorHtml = `
                <select onchange="updateCartItemUnit(${index}, this.value)" class="form-control" style="padding: 2px 4px; font-size: 0.8rem; width: 68px;">
                    <option value="ltr" ${(item.saleUnit === 'ltr' || !item.saleUnit) ? 'selected' : ''}>Ltr</option>
                    <option value="ml" ${item.saleUnit === 'ml' ? 'selected' : ''}>ml</option>
                </select>
            `;
        }

        const isGramOrMl = item.saleUnit === 'grm' || item.saleUnit === 'ml';
        const qtyStep = isGramOrMl ? '1' : (item.unit === 'kg' || item.unit === 'ltr' ? '0.001' : '1');
        const qtyPlaceholder = item.saleUnit === 'grm' ? '250 grm' : (item.saleUnit === 'ml' ? '500 ml' : '1');

        htmlRows += `
            <tr>
                <td>${item.name}</td>
                <td>${item.batch || 'GEN'}</td>
                <td>${settings.currency}${item.salePrice}</td>
                <td>
                    <input type="number" value="${item.qty}" min="0.001" step="${qtyStep}" placeholder="${qtyPlaceholder}"
                        onchange="updateQty('${item.id}', this.value)" class="form-control qty-input">
                </td>
                <td>${unitSelectorHtml}</td>
                <td>${item.gst}%</td>
                <td>${settings.currency}${lineTotal.toFixed(2)}</td>
                <td>
                    <button class="btn btn-outline" onclick="removeFromCart(${index})" style="color: var(--danger-color); padding: 4px 8px;">
                        <i data-lucide="x" style="width: 16px;"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlRows;
    
    lucide.createIcons();
    updateCartTotals();
}

function updateCartItemUnit(index, newSaleUnit) {
    if (!cart[index]) return;
    const oldUnit = cart[index].saleUnit || cart[index].unit;
    cart[index].saleUnit = newSaleUnit;

    if (oldUnit === 'kg' && newSaleUnit === 'grm') {
        cart[index].qty = (parseFloat(cart[index].qty) || 1) * 1000;
    } else if (oldUnit === 'grm' && newSaleUnit === 'kg') {
        cart[index].qty = (parseFloat(cart[index].qty) || 1000) / 1000;
    } else if (oldUnit === 'ltr' && newSaleUnit === 'ml') {
        cart[index].qty = (parseFloat(cart[index].qty) || 1) * 1000;
    } else if (oldUnit === 'ml' && newSaleUnit === 'ltr') {
        cart[index].qty = (parseFloat(cart[index].qty) || 1000) / 1000;
    }

    renderCart();
}

function updateQty(id, val) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.qty = parseFloat(val) || 0;
        renderCart();
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function clearCart() {
    if (confirm('Clear all items from cart?')) {
        cart = [];
        if (typeof loadedDigitalOrderId !== 'undefined') {
            loadedDigitalOrderId = null;
        }
        if (document.getElementById('customer-name')) document.getElementById('customer-name').value = '';
        if (document.getElementById('customer-phone')) document.getElementById('customer-phone').value = '';
        renderCart();
        if (isReturnMode) toggleReturnMode();
    }
}

function updateCartTotals() {
    const includeGst = document.getElementById('gst-toggle') ? document.getElementById('gst-toggle').checked : true;
    const discInput = parseFloat(document.getElementById('discount-input') ? document.getElementById('discount-input').value : 0) || 0;
    const discType = document.getElementById('discount-type') ? document.getElementById('discount-type').value : 'amount';

    let subtotal = 0;
    let gstTotal = 0;

    cart.forEach(item => {
        const lineTotal = getItemLineTotal(item);
        subtotal += lineTotal;
        
        if (includeGst) {
            gstTotal += (lineTotal * (item.gst || 0) / 100);
        }
    });

    let discount = 0;
    if (discType === 'percent') {
        discount = (subtotal + gstTotal) * (discInput / 100);
    } else {
        discount = discInput;
    }

    const grandTotal = subtotal + gstTotal - discount;

    if (document.getElementById('summary-subtotal')) document.getElementById('summary-subtotal').textContent = `${settings.currency}${subtotal.toFixed(2)}`;
    if (document.getElementById('summary-gst')) document.getElementById('summary-gst').textContent = `${settings.currency}${gstTotal.toFixed(2)}`;
    if (document.getElementById('summary-grand-total')) document.getElementById('summary-grand-total').textContent = `${settings.currency}${grandTotal.toFixed(2)}`;
}

// --- Hold Bill Logic ---
function holdCurrentCart() {
    if (cart.length === 0) {
        alert("Cart is empty! There's nothing to hold.");
        return;
    }
    
    const cartName = prompt("Enter a name or identifier for this suspended bill (e.g. Person 1):", `Cart ${heldCarts.length + 1}`);
    if (!cartName) return;

    const cartData = {
        name: cartName,
        timestamp: Date.now(),
        cartFiles: JSON.parse(JSON.stringify(cart)),
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        discount: document.getElementById('discount-input').value,
        discountType: document.getElementById('discount-type').value,
        gstToggle: document.getElementById('gst-toggle').checked
    };

    heldCarts.push(cartData);
    localStorage.setItem('mediflow_held_carts', JSON.stringify(heldCarts));
    
    // Clear UI
    document.getElementById('clear-cart-btn').click(); 
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    renderCartTabs();
    alert(`Bill suspended safely as "${cartName}".`);
}

function recallCart(index) {
    if (cart.length > 0) {
        if (!confirm("You currently have items in the active cart! Recalling a held bill will erase the current one. Proceed?")) {
            return;
        }
    }

    const cData = heldCarts[index];
    cart = [...cData.cartFiles];
    document.getElementById('customer-name').value = cData.customerName || '';
    document.getElementById('customer-phone').value = cData.customerPhone || '';
    document.getElementById('discount-input').value = cData.discount || '0';
    document.getElementById('discount-type').value = cData.discountType || 'percent';
    
    const toggle = document.getElementById('gst-toggle');
    if (toggle) toggle.checked = cData.gstToggle;

    heldCarts.splice(index, 1);
    localStorage.setItem('mediflow_held_carts', JSON.stringify(heldCarts));
    
    renderCart();
    renderCartTabs();
}

function renderCartTabs() {
    const container = document.getElementById('cart-tabs-container');
    if (!container) return;
    container.innerHTML = '';
    
    heldCarts.forEach((hc, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline';
        btn.style.cssText = "padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; background: var(--warning-light); color: var(--warning-color); border-color: var(--warning-color); display: flex; gap: 6px; align-items: center; cursor: pointer; white-space: nowrap;";
        btn.innerHTML = `<i data-lucide="shopping-bag" style="width: 14px;"></i> ${hc.name} <span class="badge" style="background: var(--danger-color); color: white; padding: 2px 6px; border-radius: 50%; font-size: 10px;">${hc.cartFiles.length}</span>`;
        btn.onclick = () => recallCart(index);
        container.appendChild(btn);
    });
    lucide.createIcons();
}

// --- Return Mode ---
// --- Sale Processing ---
function setPayMode(mode, btn) {
    currentPayMode = mode;
    document.querySelectorAll('.pay-mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

async function processSale(shouldPrint, shouldWhatsApp = false) {
    if (cart.length === 0) {
        alert('Cart is empty!');
        return;
    }

    if (typeof loadedDigitalOrderId !== 'undefined' && loadedDigitalOrderId) {
        if (sales.some(s => s.digitalOrderId === loadedDigitalOrderId)) {
            alert("This waiter order has already been billed and checked out.");
            return;
        }
    }

    const invoiceNo = document.getElementById('invoice-number').value;
    const customer = {
        name: document.getElementById('customer-name').value || 'Cash Customer',
        phone: document.getElementById('customer-phone').value || '-'
    };

    const subtotal = parseFloat(document.getElementById('summary-subtotal').textContent.replace(settings.currency, ''));
    const gst = parseFloat(document.getElementById('summary-gst').textContent.replace(settings.currency, ''));
    const discInput = parseFloat(document.getElementById('discount-input').value) || 0;
    const discType = document.getElementById('discount-type').value;
    
    let discountAmount = discType === 'percent' ? (subtotal + gst) * (discInput / 100) : discInput;
    let grandTotal = subtotal + gst - discountAmount;

    let finalInvoiceNo = invoiceNo;
    let finalSubtotal = subtotal;
    let finalGst = gst;
    let finalDiscount = discountAmount;
    
    // Apply return mode negation
    if (isReturnMode) {
        finalInvoiceNo = 'RET-' + invoiceNo;
        finalSubtotal = -subtotal;
        finalGst = -gst;
        finalDiscount = -discountAmount;
        grandTotal = -grandTotal;
    }

    const waiterSelect = document.getElementById('billing-waiter-select');
    const doctorInput = document.getElementById('billing-doctor-name');
    const tableSelect = document.getElementById('billing-table-select');

    const waiterName = (waiterSelect && waiterSelect.value) ? waiterSelect.value : '';
    const doctorName = (doctorInput && doctorInput.value) ? doctorInput.value.trim() : '';
    const tableName = (tableSelect && tableSelect.value) ? tableSelect.value : '';

    const saleData = {
        id: 'S' + Date.now(),
        invoiceNo: finalInvoiceNo,
        digitalOrderId: (typeof loadedDigitalOrderId !== 'undefined' ? loadedDigitalOrderId : null),
        isDigitalOrder: (typeof loadedDigitalOrderId !== 'undefined' && loadedDigitalOrderId) ? true : false,
        customer,
        items: cart.map(item => ({...item, qty: isReturnMode ? -item.qty : item.qty})),
        subtotal: finalSubtotal,
        gst: finalGst,
        discount: finalDiscount,
        grandTotal: grandTotal,
        paymentMode: currentPayMode,
        date: new Date().toISOString(),
        isReturn: isReturnMode,
        waiterName: waiterName,
        doctorName: doctorName,
        tableName: tableName
    };

    // Update Stock using Unit Deduction
    cart.forEach(item => {
        const pIndex = products.findIndex(p => p.id === item.id);
        if (pIndex !== -1) {
            const deductQty = getItemStockDeduction(item);
            if (isReturnMode) {
                products[pIndex].stock += deductQty;
            } else {
                products[pIndex].stock -= deductQty;
            }
        }
    });

    // Update Customer Stats
    if (customer.name !== 'Cash Customer' && customer.phone !== '-') {
        let cust = customers.find(c => c.phone === customer.phone);
        if (!cust) {
            cust = { id: 'C' + Date.now(), name: customer.name, phone: customer.phone, visits: 0, totalSpent: 0 };
            customers.push(cust);
        }
        cust.visits = (cust.visits || 0) + 1;
        cust.totalSpent = (parseFloat(cust.totalSpent) || 0) + grandTotal;
        localStorage.setItem('mediflow_customers', JSON.stringify(customers));
        renderCustomers();
    }

    sales.push(saleData);
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    localStorage.setItem('mediflow_sales', JSON.stringify(sales));
    syncToCloud('products', products);
    syncToCloud('sales', sales);

    // Free table status when bill is completed
    if (tableName) {
        updateTableStatusByRef(tableName, 'Available');
    }

    if (shouldPrint) {
        printBill(saleData);
    } else if (shouldWhatsApp) {
        sendWhatsAppBill(saleData.id);
    } else {
        alert('Sale saved successfully!');
    }

    // Cleanup pending Waiter order if applicable
    if (typeof loadedDigitalOrderId !== 'undefined' && loadedDigitalOrderId) {
        let digitalOrders = JSON.parse(localStorage.getItem(getPendingOrdersKey())) || [];
        digitalOrders = digitalOrders.filter(d => d.id !== loadedDigitalOrderId && d.invoiceNo !== loadedDigitalOrderId);
        localStorage.setItem(getPendingOrdersKey(), JSON.stringify(digitalOrders));
        if (typeof syncToCloud === 'function') syncToCloud('digital_orders', digitalOrders);

        if (typeof isFirebaseEnabled !== 'undefined' && isFirebaseEnabled && db) {
            try {
                await db.collection('waiter_orders').doc(loadedDigitalOrderId).update({ status: 'Billed' });
            } catch (err) {
                console.error("Firebase update failed:", err);
            }
        }
        loadedDigitalOrderId = null; // Clear global state
    }

    // Reset
    cart = [];
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    document.getElementById('discount-input').value = '0';
    currentPayMode = 'Cash';
    document.querySelectorAll('.pay-mode').forEach(b => {
        b.classList.remove('active');
        if (b.getAttribute('data-mode') === 'Cash') b.classList.add('active');
    });
    renderCart();
    renderProducts();
    renderDashboard();
    renderSalesHistory();
    generateInvoiceNumber();
    if (isReturnMode) toggleReturnMode();
}

function printBill(sale) {
    try {
        const bill = document.getElementById('thermal-bill');
        
        // Set print size class
        bill.className = ''; // Reset
        bill.classList.add('print-' + (settings.printerType || '3inch'));

        // Fill the hidden bill with settings
        const logoImg = document.getElementById('bill-logo');
        const defaultLogo = document.getElementById('bill-default-logo');
        if (logoImg) {
            if (settings.shopLogo) {
                logoImg.src = settings.shopLogo;
                logoImg.style.display = 'inline-block';
                if (defaultLogo) defaultLogo.style.display = 'none';
            } else {
                logoImg.style.display = 'none';
                if (defaultLogo) defaultLogo.style.display = 'inline-block';
            }
        }

    document.getElementById('bill-shop-name').textContent = settings.shopName;
    document.getElementById('bill-shop-address').innerHTML = `${settings.shopAddress}<br>Phone: ${settings.shopPhone}`;
    
    const gstinEl = document.getElementById('bill-shop-gstin');
    if (gstinEl) {
        if (settings.shopGstin && settings.shopGstin.trim() !== '') {
            gstinEl.textContent = `GSTIN: ${settings.shopGstin}`;
            gstinEl.style.display = 'block';
        } else {
            gstinEl.style.display = 'none';
        }
    }
    
    const returnHeader = document.getElementById('bill-return-header');
    if (returnHeader) {
        if (sale.isReturn) {
            returnHeader.style.display = 'block';
        } else {
            returnHeader.style.display = 'none';
        }
    }

    document.getElementById('bill-inv-no').textContent = sale.invoiceNo;
    const saleDate = new Date(sale.date);
    document.getElementById('bill-date').textContent = saleDate.toLocaleDateString();
    const timeEl = document.getElementById('bill-time');
    if (timeEl) timeEl.textContent = saleDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const cashierEl = document.getElementById('bill-cashier');
    if (cashierEl) cashierEl.textContent = sessionStorage.getItem('mediflow_user') || 'Unknown';
    
    const itemsTbody = document.getElementById('bill-items-body');
    itemsTbody.innerHTML = sale.items.map((item, index) => {
        const qtyDisplay = formatPrintQty(item);
        const rateDisplay = formatPrintRate(item);
        const lineTotal = typeof getItemLineTotal === 'function' ? getItemLineTotal(item) : (item.salePrice * item.qty);

        return `
            <tr>
                <td style="padding: 2px 0;">${index + 1}</td>
                <td style="padding: 2px 0; word-break: break-word;">${item.name}</td>
                <td style="padding: 2px 0; text-align: center;">${qtyDisplay}</td>
                <td style="padding: 2px 0; text-align: right; font-size: 0.72rem; line-height: 1.2; white-space: nowrap;">${rateDisplay}</td>
                <td style="padding: 2px 0; text-align: right;">${lineTotal.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const curr = settings.currency || '₹';
    document.getElementById('bill-subtotal').textContent = `${sale.subtotal.toFixed(2)}`;
    
    const gstRow = document.getElementById('bill-gst-row');
    if (gstRow) {
        if (settings.taxEnabled) {
            gstRow.style.display = 'grid';
            document.getElementById('bill-gst').textContent = `${sale.gst.toFixed(2)}`;
        } else {
            gstRow.style.display = 'none';
        }
    }
    document.getElementById('bill-discount').textContent = `${sale.discount.toFixed(2)}`;
    document.getElementById('bill-grand-total').textContent = `${curr}${sale.grandTotal.toFixed(2)}`;
    
    const payModeEl = document.getElementById('bill-payment-mode');
    if (payModeEl) payModeEl.textContent = sale.paymentMode || 'CASH';
    
    const amtPaidEl = document.getElementById('bill-amount-paid');
    if (amtPaidEl) amtPaidEl.textContent = sale.grandTotal.toFixed(2);
    
    const transIdEl = document.getElementById('bill-trans-id');
    if (transIdEl) transIdEl.textContent = (sale.paymentMode || 'CASH') + '/' + sale.id.substring(sale.id.length - 8).toUpperCase();

    const supportEl = document.getElementById('bill-support-phone');
    if (supportEl) supportEl.textContent = settings.shopPhone || '+91 00000 00000';
    
    const executePrint = () => {
        // Show template
        document.body.classList.add('printing-bill');
        bill.style.display = 'block';

        // Small delay to ensure rendering before print dialog blocks thread
        setTimeout(() => {
            window.print();
            // Hide immediately after print dialog closes
            bill.style.display = 'none';
            document.body.classList.remove('printing-bill');
        }, 150);
    };

    const triggerPrint = () => {
        const isPreviewMode = (settings.printMode || 'preview') === 'preview';
        if (isPreviewMode) {
            openPrintPreviewModal(bill.innerHTML, executePrint);
        } else {
            executePrint();
        }
    };

    const qrPlaceholder = document.getElementById('bill-qr-placeholder');
    const qrImg = document.getElementById('bill-qr-img');
    if (qrPlaceholder && qrImg) {
        if (settings.shopUpi && settings.shopUpi.trim() !== '') {
            // Generate standard UPI string: upi://pay?pa=UPI_ID&pn=SHOP_NAME&am=AMOUNT
            const upiString = `upi://pay?pa=${settings.shopUpi.trim()}&pn=${encodeURIComponent(settings.shopName)}&am=${sale.grandTotal.toFixed(2)}`;
            const qrUrl = window.generateOfflineQRCode(upiString, 150);
            
            qrImg.src = qrUrl;
            qrImg.style.display = 'inline-block';
            qrPlaceholder.style.display = 'none';
            
            // Do not block checkout waiting for external QR generation
            triggerPrint();
        } else {
            qrImg.style.display = 'none';
            qrPlaceholder.style.display = 'inline-flex';
            triggerPrint();
        }
    } else {
        triggerPrint();
    }
    } catch (err) {
        alert("Print error: " + err.message);
        console.error(err);
        const bill = document.getElementById('thermal-bill');
        if (bill) bill.style.display = 'none';
    }
}

function printTestReceipt() {
    const dummySale = {
        id: 'TEST' + Date.now().toString(),
        invoiceNo: 'TEST-0001',
        date: new Date().toISOString(),
        customer: { name: 'Test Customer', phone: '0000000000' },
        items: [
            { name: 'Test Product 1', qty: 2, salePrice: 150.00 },
            { name: 'Test Product 2', qty: 1, salePrice: 200.00 }
        ],
        subtotal: 500.00,
        discount: 50.00,
        gst: 90.00,
        grandTotal: 540.00,
        paymentMode: 'UPI'
    };
    printBill(dummySale);
}

function generateShiftSummary() {
    const todayStr = new Date().toDateString();
    
    let cashTotal = 0;
    let gpayTotal = 0;
    let creditTotal = 0;

    sales.forEach(sale => {
        if (sale.paymentMode !== 'Pending' && sale.status !== 'Pending' && !sale.isCancelled && new Date(sale.date).toDateString() === todayStr) {
            const mode = sale.paymentMode || 'Cash';
            if (mode === 'Cash') cashTotal += (sale.grandTotal || 0);
            else if (mode === 'GPay') gpayTotal += (sale.grandTotal || 0);
            else if (mode === 'Credit') creditTotal += (sale.grandTotal || 0);
        }
    });

    return {
        cash: cashTotal,
        gpay: gpayTotal,
        credit: creditTotal,
        total: cashTotal + gpayTotal + creditTotal
    };
}

async function printShiftSummaryReceipt(actionType) {
    const summary = generateShiftSummary();
    const bill = document.getElementById('thermal-summary');
    if (!bill) return;

    // Remove old print classes, add new one
    document.body.classList.remove('print-3inch', 'print-4inch', 'print-a4', 'print-a5');
    if (settings.printerType) document.body.classList.add(`print-${settings.printerType}`);
    
    const shopNameEl = document.getElementById('summary-shop-name');
    if (shopNameEl) shopNameEl.textContent = settings.shopName || 'T7 BILLPRO';
    
    const typeEl = document.getElementById('summary-type');
    if (typeEl) typeEl.textContent = actionType === 'LOGIN' ? 'Login Summary' : 'Logout Summary';
    
    const dateEl = document.getElementById('summary-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleString();
    
    const userEl = document.getElementById('summary-user');
    if (userEl) userEl.textContent = sessionStorage.getItem('mediflow_user') || 'Unknown User';

    const curr = settings.currency || '₹';
    document.getElementById('summary-cash').textContent = `${curr}${summary.cash.toFixed(2)}`;
    document.getElementById('summary-gpay').textContent = `${curr}${summary.gpay.toFixed(2)}`;
    document.getElementById('summary-credit').textContent = `${curr}${summary.credit.toFixed(2)}`;
    document.getElementById('summary-total').textContent = `${curr}${summary.total.toFixed(2)}`;

    // Ensure main thermal bill is hidden and only summary is printed
    const mainBill = document.getElementById('thermal-bill');
    if (mainBill) mainBill.style.display = 'none';
        document.body.classList.add('printing-bill');
        bill.style.display = 'block';

        // Trigger automated local backup BEFORE printing to preserve user gesture for permission prompts
        if (typeof window.runAutoLocalBackup === 'function') {
            try {
                await window.runAutoLocalBackup();
            } catch (e) {
                console.error("Backup failed during shift summary", e);
            }
        }

        window.print();
        
        bill.style.display = 'none';
        document.body.classList.remove('printing-bill');
}

// --- Sales History ---
function renderSalesHistory() {
    try {
        const tbody = document.querySelector('#sales-history-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        const fromDate = document.getElementById('sale-date-from')?.value;
        const toDate = document.getElementById('sale-date-to')?.value;
        const searchQuery = document.getElementById('sale-search')?.value.toLowerCase().trim();

        let filteredSales = sales.filter(s => s.paymentMode !== 'Pending' && s.status !== 'Pending' && !s.isCancelled);

        if (fromDate) {
            filteredSales = filteredSales.filter(s => s.date && new Date(s.date) >= new Date(fromDate));
        }
        if (toDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);
            filteredSales = filteredSales.filter(s => s.date && new Date(s.date) <= end);
        }

        if (searchQuery) {
            filteredSales = filteredSales.filter(s => {
                const invNo = (s.invoiceNo || '').toLowerCase();
                const custName = (s.customer && s.customer.name ? s.customer.name : '').toLowerCase();
                const custPhone = (s.customer && s.customer.phone ? s.customer.phone : '').toLowerCase();
                return invNo.includes(searchQuery) || custName.includes(searchQuery) || custPhone.includes(searchQuery);
            });
        }

        let htmlRows = '';
        filteredSales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
            const amount = parseFloat(s.grandTotal || s.total || 0);
            const itemsCount = s.items ? s.items.length : 0;
            const custName = (s.customer && s.customer.name) ? s.customer.name : 'Cash Customer';
            const payMode = s.paymentMode || 'Cash';

            htmlRows += `<tr>
                <td>#${s.invoiceNo || '---'}</td>
                <td>${s.date ? new Date(s.date).toLocaleString() : '---'}</td>
                <td>${custName}</td>
                <td><span class="badge" style="background: ${payMode === 'Credit' ? '#fee2e2' : '#dcfce7'}; color: ${payMode === 'Credit' ? '#dc2626' : '#16a34a'};">${payMode}</span></td>
                <td><strong>${settings.currency}${amount.toFixed(2)}</strong></td>
                <td>${itemsCount} items</td>
                <td>
                    <button class="btn btn-outline" onclick="reprintBill('${s.id}')" title="Reprint Bill" style="padding: 5px;"><i data-lucide="printer" style="width: 16px;"></i></button>
                    <button class="btn btn-outline" onclick="sendWhatsAppBill('${s.id}')" title="WhatsApp Bill" style="padding: 5px; color: #25d366;"><i data-lucide="message-square" style="width: 16px;"></i></button>
                    ${!s.isReturn ? `<button class="btn btn-outline" onclick="openReturnBillModal('${s.invoiceNo || s.id}')" title="Return Bill" style="padding: 5px; color: var(--danger-color);"><i data-lucide="rotate-ccw" style="width: 16px;"></i></button>` : ''}
                    ${sessionStorage.getItem('mediflow_user') === 'VIKI' ? `<button class="btn btn-outline" onclick="deleteSale('${s.id}')" title="Delete Sale" style="padding: 5px; color: var(--danger-color);"><i data-lucide="trash" style="width: 16px;"></i></button>` : ''}
                </td>
            </tr>`;
        });
        tbody.innerHTML = htmlRows;
        lucide.createIcons();
    } catch (e) {
        console.error('Error rendering sales history:', e);
    }
}

function deleteSale(id) {
    if (!confirm('Are you sure you want to delete this sale? This will restock the sold items.')) return;
    
    const loggedInUsername = sessionStorage.getItem('mediflow_user');
    let actualRole = 'staff'; 
    if (loggedInUsername === 'VIKI') {
        actualRole = 'superadmin';
    } else {
        const foundUser = admins.find(a => a.username === loggedInUsername);
        if (foundUser) actualRole = foundUser.role;
    }
    
    if (actualRole === 'staff') {
        alert('Access Denied: Staff cannot delete sales.');
        return;
    }

    const saleIndex = sales.findIndex(s => s.id === id);
    if (saleIndex > -1) {
        const sale = sales[saleIndex];
        
        // Restore stock
        if (sale.items && Array.isArray(sale.items)) {
            sale.items.forEach(item => {
                const prodIndex = products.findIndex(p => p.id === item.id);
                if (prodIndex > -1) {
                    products[prodIndex].stock += item.qty;
                }
            });
            localStorage.setItem('mediflow_products', JSON.stringify(products));
            syncToCloud('products', products);
        }

        sales.splice(saleIndex, 1);
        localStorage.setItem('mediflow_sales', JSON.stringify(sales));
        syncToCloud('sales', sales);

        renderSalesHistory();
        renderDashboard();
        if (activeSection === 'products') renderProducts();
        alert('Sale deleted and stock restored successfully.');
    }
}

// --- Purchase & Expenses Logic ---
let purchaseCart = [];

function switchPurchaseTab(tab) {
    const modeMulti = document.getElementById('pur-mode-multi');
    const modeSingle = document.getElementById('pur-mode-single');
    const btnMulti = document.getElementById('btn-pur-tab-multi');
    const btnSingle = document.getElementById('btn-pur-tab-single');

    if (tab === 'single') {
        if (modeMulti) modeMulti.style.display = 'none';
        if (modeSingle) modeSingle.style.display = 'block';
        if (btnMulti) { btnMulti.classList.remove('btn-primary'); btnMulti.classList.add('btn-outline'); }
        if (btnSingle) { btnSingle.classList.remove('btn-outline'); btnSingle.classList.add('btn-primary'); }
        renderProductDropdown();
        renderSupplierDropdown();
        const singleDate = document.getElementById('pur-single-date');
        if (singleDate && !singleDate.value) singleDate.value = new Date().toISOString().split('T')[0];
    } else {
        if (modeMulti) modeMulti.style.display = 'block';
        if (modeSingle) modeSingle.style.display = 'none';
        if (btnMulti) { btnMulti.classList.remove('btn-outline'); btnMulti.classList.add('btn-primary'); }
        if (btnSingle) { btnSingle.classList.remove('btn-primary'); btnSingle.classList.add('btn-outline'); }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function renderProductDropdown() {
    const select = document.getElementById('pur-product-select');
    const oldSelect = document.getElementById('pur-product');
    const singleSelect = document.getElementById('pur-single-product');
    
    let html = '<option value="">Select Product...</option>';
    if (Array.isArray(products)) {
        products.forEach(p => {
            const batchInfo = p.batch ? ` [Batch: ${p.batch}]` : '';
            const prodName = typeof escapeHtml === 'function' ? escapeHtml(p.name) : p.name;
            html += `<option value="${p.id}">${prodName}${batchInfo} (Stock: ${p.stock || 0})</option>`;
        });
    }

    if (select) select.innerHTML = html;
    if (oldSelect) oldSelect.innerHTML = html;
    if (singleSelect) singleSelect.innerHTML = html;
}

function onIndividualProductSelect(productId) {
    if (!productId) return;
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const nameInput = document.getElementById('pur-single-item-name');
    const priceInput = document.getElementById('pur-single-price');
    const sellInput = document.getElementById('pur-single-sell-price');
    const batchInput = document.getElementById('pur-single-batch');
    const expiryInput = document.getElementById('pur-single-expiry');
    const qtyInput = document.getElementById('pur-single-qty');

    if (nameInput) nameInput.value = prod.name || '';
    if (priceInput) priceInput.value = parseFloat(prod.purchasePrice || prod.price || 0).toFixed(2);
    if (sellInput) sellInput.value = parseFloat(prod.salePrice || prod.mrp || prod.price || 0).toFixed(2);
    if (batchInput) batchInput.value = prod.batch || '';
    if (expiryInput) expiryInput.value = prod.expiry || '';
    if (qtyInput && (!qtyInput.value || parseFloat(qtyInput.value) <= 0)) qtyInput.value = 1;

    calculateSinglePurchaseTotal();
}

function calculateSinglePurchaseTotal() {
    const qty = parseFloat(document.getElementById('pur-single-qty') ? document.getElementById('pur-single-qty').value : 0) || 0;
    const price = parseFloat(document.getElementById('pur-single-price') ? document.getElementById('pur-single-price').value : 0) || 0;
    const displayEl = document.getElementById('pur-single-total-display');
    const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';
    if (displayEl) {
        displayEl.textContent = curr + (qty * price).toFixed(2);
    }
}

function handleIndividualPurchaseSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('pur-single-product') ? document.getElementById('pur-single-product').value : '';
    const manualName = document.getElementById('pur-single-item-name') ? document.getElementById('pur-single-item-name').value.trim() : '';
    const prod = products.find(p => p.id === productId);
    const itemName = manualName || (prod ? prod.name : '');

    if (!itemName) {
        alert('Please enter a purchase item name.');
        return;
    }

    const qty = parseFloat(document.getElementById('pur-single-qty').value) || 0;
    const price = parseFloat(document.getElementById('pur-single-price').value) || 0;
    const sellingPrice = parseFloat(document.getElementById('pur-single-sell-price').value) || 0;
    const supplier = (document.getElementById('pur-single-supplier').value || '').trim();
    const invoiceInput = (document.getElementById('pur-single-invoice').value || '').trim();
    const dateInput = document.getElementById('pur-single-date').value || new Date().toISOString().split('T')[0];
    const paymentMode = document.getElementById('pur-single-payment-mode') ? document.getElementById('pur-single-payment-mode').value : 'Cash';
    const batch = (document.getElementById('pur-single-batch').value || '').trim();
    const expiry = (document.getElementById('pur-single-expiry').value || '').trim();

    if (qty <= 0) {
        alert('Please enter a quantity greater than 0.');
        return;
    }
    if (price < 0) {
        alert('Please enter a valid purchase price.');
        return;
    }

    const invoice = invoiceInput || ('INV-' + Math.floor(100000 + Math.random() * 900000));
    const lineTotal = qty * price;
    const itemId = prod ? prod.id : ('MANUAL_' + Date.now());

    const purchaseData = {
        id: 'PUR' + Date.now(),
        invoice,
        supplier,
        date: dateInput,
        paymentMode,
        grandTotal: lineTotal,
        total: lineTotal,
        totalQty: qty,
        itemsCount: 1,
        productId: itemId,
        productName: itemName,
        qty: qty,
        price: price,
        items: [{
            productId: itemId,
            productName: itemName,
            qty: qty,
            purchasePrice: price,
            sellingPrice: sellingPrice || (prod ? (prod.salePrice || prod.mrp || 0) : 0),
            batch: batch || (prod ? prod.batch || '' : ''),
            expiry: expiry || (prod ? prod.expiry || '' : ''),
            total: lineTotal
        }]
    };

    // Update individual product stock & pricing (only if updateStock checkbox is checked)
    const updateStockChecked = document.getElementById('pur-update-stock') ? document.getElementById('pur-update-stock').checked : false;
    if (updateStockChecked) {
        const pIndex = products.findIndex(p => p.id === prod.id);
        if (pIndex !== -1) {
            products[pIndex].stock = (parseFloat(products[pIndex].stock) || 0) + qty;
            if (price > 0) products[pIndex].purchasePrice = price;
            if (sellingPrice > 0) {
                products[pIndex].salePrice = sellingPrice;
                products[pIndex].mrp = sellingPrice;
            }
            if (batch) products[pIndex].batch = batch;
            if (expiry) products[pIndex].expiry = expiry;
        }
    }

    purchases.push(purchaseData);
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    localStorage.setItem('mediflow_purchases', JSON.stringify(purchases));

    if (typeof syncToCloud === 'function') {
        syncToCloud('products', { data: products });
        syncToCloud('purchases', { data: purchases });
    }

    e.target.reset();
    if (document.getElementById('pur-single-date')) {
        document.getElementById('pur-single-date').value = new Date().toISOString().split('T')[0];
    }
    calculateSinglePurchaseTotal();
    renderPurchases();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof activeSection !== 'undefined') {
        if (activeSection === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
        if (activeSection === 'suppliers' && typeof renderSuppliers === 'function') renderSuppliers();
    }
    alert('Individual product purchase recorded & stock updated successfully!');
}

function onPurchaseProductSelect(productId) {
    if (!productId) return;
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const nameInput = document.getElementById('pur-item-manual-name');
    const costInput = document.getElementById('pur-item-cost');
    const sellInput = document.getElementById('pur-item-sell');
    const batchInput = document.getElementById('pur-item-batch');
    const expiryInput = document.getElementById('pur-item-expiry');
    const qtyInput = document.getElementById('pur-item-qty');

    if (nameInput) nameInput.value = prod.name || '';
    if (costInput) costInput.value = parseFloat(prod.purchasePrice || prod.price || 0).toFixed(2);
    if (sellInput) sellInput.value = parseFloat(prod.salePrice || prod.mrp || prod.price || 0).toFixed(2);
    if (batchInput) batchInput.value = prod.batch || '';
    if (expiryInput) expiryInput.value = prod.expiry || '';
    if (qtyInput && (!qtyInput.value || parseFloat(qtyInput.value) <= 0)) qtyInput.value = 1;
}

function addPurchaseItemToCart() {
    const select = document.getElementById('pur-product-select');
    const manualNameInput = document.getElementById('pur-item-manual-name');
    
    const productId = select ? select.value : '';
    const prod = products.find(p => p.id === productId);
    const manualName = manualNameInput ? manualNameInput.value.trim() : '';
    const itemName = manualName || (prod ? prod.name : '');

    if (!itemName) {
        alert('Please enter or select a purchase item name.');
        return;
    }

    const qty = parseFloat(document.getElementById('pur-item-qty').value) || 0;
    const purchasePrice = parseFloat(document.getElementById('pur-item-cost').value) || 0;
    const sellingPrice = parseFloat(document.getElementById('pur-item-sell').value) || 0;
    const batch = (document.getElementById('pur-item-batch').value || '').trim();
    const expiry = (document.getElementById('pur-item-expiry').value || '').trim();

    if (qty <= 0) {
        alert('Please enter a valid quantity greater than 0.');
        return;
    }
    if (purchasePrice < 0) {
        alert('Please enter a valid purchase cost.');
        return;
    }

    const itemId = prod ? prod.id : ('MANUAL_' + Date.now());
    const existingIndex = purchaseCart.findIndex(item => item.productName === itemName && item.batch === batch);
    if (existingIndex !== -1) {
        purchaseCart[existingIndex].qty += qty;
        purchaseCart[existingIndex].purchasePrice = purchasePrice;
        if (sellingPrice > 0) purchaseCart[existingIndex].sellingPrice = sellingPrice;
        if (expiry) purchaseCart[existingIndex].expiry = expiry;
        purchaseCart[existingIndex].total = purchaseCart[existingIndex].qty * purchaseCart[existingIndex].purchasePrice;
    } else {
        purchaseCart.push({
            productId: itemId,
            productName: itemName,
            qty: qty,
            purchasePrice: purchasePrice,
            sellingPrice: sellingPrice || (prod ? (prod.salePrice || prod.mrp || 0) : 0),
            batch: batch || (prod ? prod.batch || '' : ''),
            expiry: expiry || (prod ? prod.expiry || '' : ''),
            total: qty * purchasePrice
        });
    }

    // Reset item input controls
    if (select) select.value = '';
    if (manualNameInput) manualNameInput.value = '';
    document.getElementById('pur-item-qty').value = '1';
    document.getElementById('pur-item-cost').value = '';
    document.getElementById('pur-item-sell').value = '';
    document.getElementById('pur-item-batch').value = '';
    document.getElementById('pur-item-expiry').value = '';

    renderPurchaseCart();
}

function removePurchaseCartItem(index) {
    if (index >= 0 && index < purchaseCart.length) {
        purchaseCart.splice(index, 1);
        renderPurchaseCart();
    }
}

function updatePurchaseCartItem(index, field, value) {
    if (index >= 0 && index < purchaseCart.length) {
        const numVal = parseFloat(value) || 0;
        if (field === 'qty') {
            purchaseCart[index].qty = Math.max(0.001, numVal);
        } else if (field === 'purchasePrice') {
            purchaseCart[index].purchasePrice = Math.max(0, numVal);
        } else if (field === 'sellingPrice') {
            purchaseCart[index].sellingPrice = Math.max(0, numVal);
        }
        purchaseCart[index].total = purchaseCart[index].qty * purchaseCart[index].purchasePrice;
        renderPurchaseCart();
    }
}

function renderPurchaseCart() {
    const tbody = document.getElementById('pur-cart-tbody');
    const countEl = document.getElementById('pur-cart-count');
    const totalQtyEl = document.getElementById('pur-cart-total-qty');
    const grandTotalEl = document.getElementById('pur-cart-grand-total');

    if (!tbody) return;

    if (purchaseCart.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                    No items added yet. Select a product above and click "Add Line".
                </td>
            </tr>
        `;
        const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';
        if (countEl) countEl.textContent = '0';
        if (totalQtyEl) totalQtyEl.textContent = '0';
        if (grandTotalEl) grandTotalEl.textContent = curr + '0.00';
        return;
    }

    let totalQty = 0;
    let grandTotal = 0;
    const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';

    tbody.innerHTML = purchaseCart.map((item, index) => {
        totalQty += item.qty;
        grandTotal += item.total;
        const nameStr = typeof escapeHtml === 'function' ? escapeHtml(item.productName) : item.productName;
        const batchBadge = item.batch ? `<br><small style="color: var(--text-muted);">Batch: ${typeof escapeHtml === 'function' ? escapeHtml(item.batch) : item.batch}</small>` : '';

        return `
            <tr>
                <td style="padding: 8px;">
                    <strong>${nameStr}</strong>
                    ${batchBadge}
                </td>
                <td style="padding: 8px;">
                    <input type="number" class="form-control" value="${item.qty}" step="0.001" min="0.001"
                        style="padding: 4px 6px; font-size: 0.85rem;"
                        onchange="updatePurchaseCartItem(${index}, 'qty', this.value)">
                </td>
                <td style="padding: 8px;">
                    <input type="number" class="form-control" value="${item.purchasePrice}" step="0.01" min="0"
                        style="padding: 4px 6px; font-size: 0.85rem;"
                        onchange="updatePurchaseCartItem(${index}, 'purchasePrice', this.value)">
                </td>
                <td style="padding: 8px;">
                    <input type="number" class="form-control" value="${item.sellingPrice}" step="0.01" min="0"
                        style="padding: 4px 6px; font-size: 0.85rem;"
                        onchange="updatePurchaseCartItem(${index}, 'sellingPrice', this.value)">
                </td>
                <td style="padding: 8px; text-align: right; font-weight: 600;">
                    ${curr}${item.total.toFixed(2)}
                </td>
                <td style="padding: 8px; text-align: center;">
                    <button type="button" class="btn btn-outline" onclick="removePurchaseCartItem(${index})" style="padding: 4px; color: var(--danger-color); border: none;">
                        <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (countEl) countEl.textContent = purchaseCart.length;
    if (totalQtyEl) totalQtyEl.textContent = totalQty % 1 === 0 ? totalQty : totalQty.toFixed(3);
    if (grandTotalEl) grandTotalEl.textContent = curr + grandTotal.toFixed(2);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function clearPurchaseCart() {
    purchaseCart = [];
    const form = document.getElementById('purchase-form');
    if (form) form.reset();

    const dateInput = document.getElementById('pur-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    renderPurchaseCart();
}

function handlePurchaseSubmit(e) {
    e.preventDefault();
    if (purchaseCart.length === 0) {
        alert('Please add at least one product line item to the purchase invoice.');
        return;
    }

    const supplier = (document.getElementById('pur-supplier').value || '').trim();
    const invoiceInput = (document.getElementById('pur-invoice').value || '').trim();
    const dateInput = document.getElementById('pur-date').value || new Date().toISOString().split('T')[0];
    const paymentMode = document.getElementById('pur-payment-mode') ? document.getElementById('pur-payment-mode').value : 'Cash';

    const invoice = invoiceInput || ('INV-' + Math.floor(100000 + Math.random() * 900000));
    const grandTotal = purchaseCart.reduce((sum, item) => sum + item.total, 0);
    const totalQty = purchaseCart.reduce((sum, item) => sum + item.qty, 0);

    const purchaseData = {
        id: 'PUR' + Date.now(),
        invoice,
        supplier,
        date: dateInput,
        paymentMode,
        grandTotal,
        total: grandTotal,
        totalQty,
        itemsCount: purchaseCart.length,
        items: JSON.parse(JSON.stringify(purchaseCart))
    };

    // Update stock & product properties for each item in invoice (only if updateStock checkbox is checked)
    const updateStockChecked = document.getElementById('pur-update-stock') ? document.getElementById('pur-update-stock').checked : false;
    if (updateStockChecked) {
        purchaseCart.forEach(item => {
            const pIndex = products.findIndex(p => p.id === item.productId);
            if (pIndex !== -1) {
                products[pIndex].stock = (parseFloat(products[pIndex].stock) || 0) + item.qty;
                if (item.purchasePrice > 0) {
                    products[pIndex].purchasePrice = item.purchasePrice;
                }
                if (item.sellingPrice > 0) {
                    products[pIndex].salePrice = item.sellingPrice;
                    products[pIndex].mrp = item.sellingPrice;
                }
                if (item.batch) products[pIndex].batch = item.batch;
                if (item.expiry) products[pIndex].expiry = item.expiry;
            }
        });
    }

    purchases.push(purchaseData);
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    localStorage.setItem('mediflow_purchases', JSON.stringify(purchases));

    if (typeof syncToCloud === 'function') {
        syncToCloud('products', { data: products });
        syncToCloud('purchases', { data: purchases });
    }

    clearPurchaseCart();
    renderPurchases();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof activeSection !== 'undefined') {
        if (activeSection === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
        if (activeSection === 'suppliers' && typeof renderSuppliers === 'function') renderSuppliers();
    }
    alert('Purchase invoice saved and stock updated successfully!');
}

function renderPurchases() {
    try {
        const tbody = document.querySelector('#purchase-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';
        
        let htmlRows = '';
        purchases.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(p => {
            const totalVal = parseFloat(p.grandTotal || p.total || 0).toFixed(2);
            const itemsSummary = p.items && Array.isArray(p.items) && p.items.length > 0 
                ? `${p.items.length} item(s)`
                : (p.productName || '1 item');
            const supplierName = p.supplier ? (typeof escapeHtml === 'function' ? escapeHtml(p.supplier) : p.supplier) : 'N/A';
            const invoiceNo = p.invoice ? (typeof escapeHtml === 'function' ? escapeHtml(p.invoice) : p.invoice) : p.id;
            const dateStr = p.date || '---';

            htmlRows += `
                <tr>
                    <td style="padding: 8px;">
                        <strong>${dateStr}</strong><br>
                        <small style="color: var(--text-muted);">${invoiceNo}</small>
                    </td>
                    <td style="padding: 8px;">
                        <strong>${supplierName}</strong><br>
                        <small style="color: var(--primary-color);">${itemsSummary}</small>
                    </td>
                    <td style="padding: 8px; text-align: right; font-weight: 600;">
                        ${curr}${totalVal}
                    </td>
                    <td style="padding: 8px; text-align: center;">
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button class="btn btn-outline" onclick="viewPurchaseDetails('${p.id}')" style="padding: 4px 8px;" title="View Details">
                                <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                            </button>
                            <button class="btn btn-outline" onclick="deletePurchase('${p.id}')" style="padding: 4px 8px; color: var(--danger-color);" title="Delete Purchase">
                                <i data-lucide="trash" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlRows;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (e) {
        console.error('Error rendering purchases:', e);
    }
}

function viewPurchaseDetails(id) {
    const purchase = purchases.find(p => p.id === id);
    if (!purchase) return;

    const modal = document.getElementById('purchase-details-modal');
    if (!modal) return;

    const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';
    document.getElementById('pur-detail-invoice').textContent = 'Invoice #' + (purchase.invoice || purchase.id);
    document.getElementById('pur-detail-supplier').textContent = 'Supplier: ' + (purchase.supplier || 'N/A');
    document.getElementById('pur-detail-date').textContent = 'Date: ' + (purchase.date || 'N/A');
    document.getElementById('pur-detail-grand-total').textContent = curr + parseFloat(purchase.grandTotal || purchase.total || 0).toFixed(2);
    
    const modeBadge = document.getElementById('pur-detail-payment-mode');
    if (modeBadge) modeBadge.textContent = purchase.paymentMode || 'Cash';

    const itemsTbody = document.getElementById('pur-detail-items-tbody');
    if (itemsTbody) {
        itemsTbody.innerHTML = '';

        if (purchase.items && Array.isArray(purchase.items) && purchase.items.length > 0) {
            purchase.items.forEach((item, index) => {
                const tr = document.createElement('tr');
                const batchExp = [item.batch ? 'Batch: ' + item.batch : '', item.expiry ? 'Exp: ' + item.expiry : ''].filter(Boolean).join(' | ') || '-';
                const buyCost = parseFloat(item.purchasePrice || item.price || 0).toFixed(2);
                const sellPrice = parseFloat(item.sellingPrice || item.salePrice || 0).toFixed(2);
                const lineTotal = parseFloat(item.total || (item.qty * buyCost)).toFixed(2);
                const nameStr = typeof escapeHtml === 'function' ? escapeHtml(item.productName || item.name || 'Product') : (item.productName || item.name || 'Product');
                const batchStr = typeof escapeHtml === 'function' ? escapeHtml(batchExp) : batchExp;

                tr.innerHTML = `
                    <td style="padding: 8px;">${index + 1}</td>
                    <td style="padding: 8px;"><strong>${nameStr}</strong></td>
                    <td style="padding: 8px; color: var(--text-muted);">${batchStr}</td>
                    <td style="padding: 8px; text-align: center;">${item.qty}</td>
                    <td style="padding: 8px; text-align: right;">${curr}${buyCost}</td>
                    <td style="padding: 8px; text-align: right;">${curr}${sellPrice}</td>
                    <td style="padding: 8px; text-align: right; font-weight: 600;">${curr}${lineTotal}</td>
                `;
                itemsTbody.appendChild(tr);
            });
        } else {
            // Legacy single item record
            const tr = document.createElement('tr');
            const buyCost = parseFloat(purchase.price || 0).toFixed(2);
            const lineTotal = parseFloat(purchase.total || 0).toFixed(2);
            const nameStr = typeof escapeHtml === 'function' ? escapeHtml(purchase.productName || 'Product') : (purchase.productName || 'Product');
            tr.innerHTML = `
                <td style="padding: 8px;">1</td>
                <td style="padding: 8px;"><strong>${nameStr}</strong></td>
                <td style="padding: 8px; color: var(--text-muted);">-</td>
                <td style="padding: 8px; text-align: center;">${purchase.qty || 1}</td>
                <td style="padding: 8px; text-align: right;">${curr}${buyCost}</td>
                <td style="padding: 8px; text-align: right;">-</td>
                <td style="padding: 8px; text-align: right; font-weight: 600;">${curr}${lineTotal}</td>
            `;
            itemsTbody.appendChild(tr);
        }
    }

    modal.style.display = 'flex';
}

function closePurchaseDetailsModal() {
    const modal = document.getElementById('purchase-details-modal');
    if (modal) modal.style.display = 'none';
}

function deletePurchase(id) {
    if (confirm('Are you sure you want to delete this purchase invoice? Stock levels will be reduced accordingly.')) {
        const purchase = purchases.find(p => p.id === id);
        if (purchase) {
            // Deduct stock for all items
            if (purchase.items && Array.isArray(purchase.items) && purchase.items.length > 0) {
                purchase.items.forEach(item => {
                    const pIndex = products.findIndex(p => p.id === item.productId);
                    if (pIndex !== -1) {
                        products[pIndex].stock = Math.max(0, (parseFloat(products[pIndex].stock) || 0) - item.qty);
                    }
                });
            } else if (purchase.productId) {
                const pIndex = products.findIndex(p => p.id === purchase.productId);
                if (pIndex !== -1) {
                    products[pIndex].stock = Math.max(0, (parseFloat(products[pIndex].stock) || 0) - (purchase.qty || 0));
                }
            }
            
            // Remove purchase entry
            purchases = purchases.filter(p => p.id !== id);
            
            // Save
            localStorage.setItem('mediflow_products', JSON.stringify(products));
            localStorage.setItem('mediflow_purchases', JSON.stringify(purchases));
            
            if (typeof syncToCloud === 'function') {
                syncToCloud('products', { data: products });
                syncToCloud('purchases', { data: purchases });
            }

            renderPurchases();
            if (typeof renderProducts === 'function') renderProducts();
            if (typeof activeSection !== 'undefined') {
                if (activeSection === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
                if (activeSection === 'suppliers' && typeof renderSuppliers === 'function') renderSuppliers();
            }
            alert('Purchase deleted and stock updated successfully.');
        }
    }
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    const categorySelect = document.getElementById('exp-category');
    const customCategoryInput = document.getElementById('exp-custom-category');
    let category = categorySelect ? categorySelect.value : '';
    const customCat = customCategoryInput ? customCategoryInput.value.trim() : '';

    if (category === 'ADD_NEW' || customCat) {
        category = customCat || category;
    }

    if (!category || category === 'ADD_NEW') {
        alert('Please enter or select an expense category.');
        return;
    }

    // Auto-save custom category to expenseCategories list if not present
    if (!expenseCategories.includes(category)) {
        expenseCategories.push(category);
        saveExpenseCategories();
        if (typeof syncToCloud === 'function') {
            syncToCloud('expenseCategories', { data: expenseCategories });
        }
    }

    const expIdInput = document.getElementById('exp-id');
    const isEditing = expIdInput && expIdInput.value !== '';
    const expenseId = isEditing ? expIdInput.value : 'EXP' + Date.now();

    const expenseData = {
        id: expenseId,
        category: category,
        description: (document.getElementById('exp-desc').value || '').trim(),
        amount: parseFloat(document.getElementById('exp-amount').value) || 0,
        date: document.getElementById('exp-date').value || new Date().toISOString().split('T')[0],
        paymentMode: document.getElementById('exp-payment-mode')?.value || 'Cash'
    };

    if (isEditing) {
        const index = expenses.findIndex(ex => ex.id === expenseId);
        if (index !== -1) {
            expenses[index] = expenseData;
        }
    } else {
        expenses.push(expenseData);
    }
    localStorage.setItem('mediflow_expenses', JSON.stringify(expenses));
    if (typeof syncToCloud === 'function') {
        syncToCloud('expenses', { data: expenses });
    }

    e.target.reset();
    if (expIdInput) expIdInput.value = '';
    const submitBtn = document.getElementById('exp-submit-btn');
    const cancelBtn = document.getElementById('exp-cancel-btn');
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="wallet"></i> <span>Save Expense</span>';
    if (cancelBtn) cancelBtn.style.display = 'none';

    if (customCategoryInput) {
        customCategoryInput.value = '';
        customCategoryInput.style.display = 'none';
    }
    if (document.getElementById('exp-date')) {
        document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
    }
    updateExpenseCategoryDropdowns();
    renderExpenses();
    
    if (isEditing) {
        alert('Expense updated successfully!');
    } else {
        alert(`Expense recorded under category "${category}" and category saved to list!`);
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderExpenses() {
    try {
        const tbody = document.querySelector('#expenses-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(ex => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${ex.date || '---'}</td>
                <td>${ex.category || '---'}</td>
                <td>${settings.currency}${parseFloat(ex.amount || 0).toFixed(2)}</td>
                <td>
                    <div style="display: flex; gap: 0.25rem;">
                        <button class="btn btn-warning" onclick="editExpense('${ex.id}')" style="padding: 4px 8px; font-size: 0.8rem;" title="Edit">
                            <i data-lucide="edit" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-danger" onclick="deleteExpense('${ex.id}')" style="padding: 4px 8px; font-size: 0.8rem;" title="Delete">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error('Error rendering expenses:', e);
    }
}

function editExpense(id) {
    const expense = expenses.find(ex => ex.id === id);
    if (!expense) return;

    const expIdInput = document.getElementById('exp-id');
    const categorySelect = document.getElementById('exp-category');
    const descInput = document.getElementById('exp-desc');
    const amountInput = document.getElementById('exp-amount');
    const dateInput = document.getElementById('exp-date');
    const paymentModeSelect = document.getElementById('exp-payment-mode');
    
    if (expIdInput) expIdInput.value = expense.id;
    if (descInput) descInput.value = expense.description || '';
    if (amountInput) amountInput.value = expense.amount || 0;
    if (dateInput) dateInput.value = expense.date || '';
    if (paymentModeSelect) paymentModeSelect.value = expense.paymentMode || 'Cash';

    if (categorySelect) {
        // If category is not in options, add it
        let optionExists = Array.from(categorySelect.options).some(opt => opt.value === expense.category);
        if (!optionExists) {
            const newOption = document.createElement('option');
            newOption.value = expense.category;
            newOption.textContent = expense.category;
            categorySelect.appendChild(newOption);
        }
        categorySelect.value = expense.category;
    }

    const submitBtn = document.getElementById('exp-submit-btn');
    const cancelBtn = document.getElementById('exp-cancel-btn');
    
    if (submitBtn) {
        submitBtn.innerHTML = '<i data-lucide="edit"></i> <span>Update Expense</span>';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'flex';
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Scroll to top of expenses section
    const expensesSection = document.getElementById('expenses');
    if (expensesSection) expensesSection.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditExpense() {
    const form = document.getElementById('expense-form');
    if (form) form.reset();
    
    const expIdInput = document.getElementById('exp-id');
    if (expIdInput) expIdInput.value = '';
    
    if (document.getElementById('exp-date')) {
        document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
    }
    
    const submitBtn = document.getElementById('exp-submit-btn');
    const cancelBtn = document.getElementById('exp-cancel-btn');
    
    if (submitBtn) {
        submitBtn.innerHTML = '<i data-lucide="wallet"></i> <span>Save Expense</span>';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    expenses = expenses.filter(ex => ex.id !== id);
    localStorage.setItem('mediflow_expenses', JSON.stringify(expenses));
    
    if (typeof syncToCloud === 'function') {
        syncToCloud('expenses', { data: expenses });
    }
    
    renderExpenses();
    renderDashboard();
}

function reprintBill(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (sale) printBill(sale);
}

// --- Dashboard Logic ---
function renderDashboard() {
    try {
        const today = new Date().toDateString();
        const todaysSales = sales.filter(s => s.date && new Date(s.date).toDateString() === today);
        const todaysExpenses = expenses.filter(ex => ex.date && new Date(ex.date).toDateString() === today);
        const todaysPurchases = purchases.filter(p => p.date && new Date(p.date).toDateString() === today);
        
        const revenue = todaysSales.reduce((sum, s) => sum + (parseFloat(s.grandTotal) || 0), 0);
        const dailyExpenses = todaysExpenses.reduce((sum, ex) => sum + (parseFloat(ex.amount) || 0), 0);
        const dailyPurchases = todaysPurchases.reduce((sum, p) => sum + ((parseFloat(p.price) || 0) * (parseFloat(p.qty) || 0)), 0);
        const netProfit = revenue - dailyExpenses - dailyPurchases;

        const lowStock = products.filter(p => (parseInt(p.stock) || 0) <= 10).length;
        const expired = products.filter(p => p.expiry && isNearExpiry(p.expiry)).length;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        const actualSalesCount = todaysSales.filter(s => !s.isReturn).length;
        setVal('stat-sales-count', actualSalesCount);
        const curr = settings.currency || '₹';
        setVal('stat-revenue', `${curr}${revenue.toFixed(2)}`);
        setVal('stat-expenses', `${curr}${dailyExpenses.toFixed(2)}`);
        setVal('stat-purchases', `${curr}${dailyPurchases.toFixed(2)}`);
        setVal('stat-profit', `${curr}${netProfit.toFixed(2)}`);
        setVal('stat-low-stock', lowStock);
        setVal('stat-expired', expired);

        // Recent Sales table
        const recentTbody = document.querySelector('#recent-sales-table tbody');
        if (recentTbody) {
            recentTbody.innerHTML = [...todaysSales].reverse().slice(0, 5).map(s => `
                <tr>
                    <td>#${s.invoiceNo || '---'}</td>
                    <td>${s.customer ? s.customer.name : 'Cash Customer'}</td>
                    <td>${s.items ? s.items.length : 0}</td>
                    <td>${curr}${(parseFloat(s.grandTotal) || 0).toFixed(2)}</td>
                    <td>${s.date ? new Date(s.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Error rendering dashboard:', e);
    }
}

// --- Helpers ---
function generateInvoiceNumber() {
    const lastSale = sales[sales.length - 1];
    let nextNo = 1;
    if (lastSale && lastSale.invoiceNo) {
        nextNo = parseInt(lastSale.invoiceNo) + 1;
    }
    const invInput = document.getElementById('invoice-number');
    if (invInput) invInput.value = nextNo.toString().padStart(6, '0');
}

function isNearExpiry(dateStr) {
    const expiryDate = new Date(dateStr);
    const today = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(today.getMonth() + 3);
    return expiryDate < threeMonthsFromNow;
}

function playBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const audioContext = new AudioCtx();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        console.error("playBeep error:", e);
    }
}

// --- Backup & Restore ---
function exportData() {
    const data = {
        products: JSON.parse(localStorage.getItem('mediflow_products')) || [],
        sales: JSON.parse(localStorage.getItem('mediflow_sales')) || [],
        settings: JSON.parse(localStorage.getItem('mediflow_settings')) || {},
        purchases: JSON.parse(localStorage.getItem('mediflow_purchases')) || [],
        expenses: JSON.parse(localStorage.getItem('mediflow_expenses')) || [],
        customers: JSON.parse(localStorage.getItem('mediflow_customers')) || [],
        suppliers: JSON.parse(localStorage.getItem('mediflow_suppliers')) || [],
        supplierPayments: JSON.parse(localStorage.getItem('mediflow_supplier_payments')) || [],
        cashTransactions: JSON.parse(localStorage.getItem('mediflow_cash_transactions')) || [],
        cashOpenings: JSON.parse(localStorage.getItem('mediflow_cash_openings')) || {},
        theme: localStorage.getItem('mediflow_theme') || 'light',
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediFlow_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('Are you sure you want to import this data? This will overwrite all your current products, sales, and settings. This action cannot be undone.')) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            
            // Basic validation
            if (!data.products || !data.sales) {
                throw new Error('Invalid backup file format.');
            }

            // Save to localStorage
            localStorage.setItem('mediflow_products', JSON.stringify(data.products));
            localStorage.setItem('mediflow_sales', JSON.stringify(data.sales));
            if (data.settings) localStorage.setItem('mediflow_settings', JSON.stringify(data.settings));
            if (data.purchases) localStorage.setItem('mediflow_purchases', JSON.stringify(data.purchases));
            if (data.expenses) localStorage.setItem('mediflow_expenses', JSON.stringify(data.expenses));
            if (data.customers) localStorage.setItem('mediflow_customers', JSON.stringify(data.customers));
            if (data.suppliers) localStorage.setItem('mediflow_suppliers', JSON.stringify(data.suppliers));
            if (data.supplierPayments) localStorage.setItem('mediflow_supplier_payments', JSON.stringify(data.supplierPayments));
            if (data.cashTransactions) localStorage.setItem('mediflow_cash_transactions', JSON.stringify(data.cashTransactions));
            if (data.cashOpenings) localStorage.setItem('mediflow_cash_openings', JSON.stringify(data.cashOpenings));
            if (data.theme) localStorage.setItem('mediflow_theme', data.theme);

            alert('Data imported successfully! The application will now reload.');
            window.location.reload();
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing data: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// --- Product Specific Backup ---
function exportProducts() {
    const productsData = JSON.parse(localStorage.getItem('mediflow_products')) || [];
    const blob = new Blob([JSON.stringify(productsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediFlow_Products_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- CSV Helper Functions ---
function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportSalesCSV() {
    const headers = ['invoiceNo', 'date', 'customerName', 'customerPhone', 'itemName', 'qty', 'price', 'gst', 'total', 'grandTotal'];
    const flattenedSales = [];
    
    sales.forEach(sale => {
        sale.items.forEach(item => {
            flattenedSales.push({
                invoiceNo: sale.invoiceNo,
                date: new Date(sale.date).toLocaleString(),
                customerName: sale.customer.name,
                customerPhone: sale.customer.phone,
                itemName: item.name,
                qty: item.qty,
                price: item.salePrice,
                gst: item.gst,
                total: (item.qty * item.salePrice).toFixed(2),
                grandTotal: sale.grandTotal.toFixed(2)
            });
        });
    });

    const csvContent = jsonToCSV(flattenedSales, headers);
    downloadBlob(csvContent, `MediFlow_Sales_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

function exportPurchasesCSV() {
    const headers = ['date', 'invoice', 'supplier', 'productName', 'qty', 'purchasePrice', 'sellingPrice', 'total', 'paymentMode'];
    const flattenedPurchases = [];
    
    (purchases || []).forEach(p => {
        if (p.items && Array.isArray(p.items) && p.items.length > 0) {
            p.items.forEach(item => {
                flattenedPurchases.push({
                    date: p.date || '',
                    invoice: p.invoice || p.id || '',
                    supplier: p.supplier || '',
                    productName: item.productName || item.name || '',
                    qty: item.qty || 0,
                    purchasePrice: item.purchasePrice || item.price || 0,
                    sellingPrice: item.sellingPrice || item.salePrice || 0,
                    total: item.total || ((item.qty || 0) * (item.purchasePrice || item.price || 0)),
                    paymentMode: p.paymentMode || 'Cash'
                });
            });
        } else {
            flattenedPurchases.push({
                date: p.date || '',
                invoice: p.invoice || p.id || '',
                supplier: p.supplier || '',
                productName: p.productName || '',
                qty: p.qty || 0,
                purchasePrice: p.price || 0,
                sellingPrice: p.sellingPrice || 0,
                total: p.total || ((p.qty || 0) * (p.price || 0)),
                paymentMode: p.paymentMode || 'Cash'
            });
        }
    });

    const csvContent = jsonToCSV(flattenedPurchases, headers);
    downloadBlob(csvContent, `MediFlow_Purchases_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

// --- Stock In & Inventory Management Logic ---
function renderStockInPage() {
    renderStockInDropdown();
    renderStockInHistory();
    const dateInput = document.getElementById('stockin-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function renderStockInDropdown() {
    const select = document.getElementById('stockin-product');
    if (!select) return;
    const currentVal = select.value;
    const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);

    let html = '<option value="">Select Product...</option>';
    if (Array.isArray(products)) {
        products.forEach(p => {
            const batchInfo = p.batch ? ` [Batch: ${p.batch}]` : '';
            html += `<option value="${p.id}">${escapeFn(p.name)}${batchInfo} (Stock: ${p.stock || 0})</option>`;
        });
    }
    select.innerHTML = html;
    if (products.some(p => p.id === currentVal)) select.value = currentVal;
}

function onStockInProductSelect(productId) {
    if (!productId) return;
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const currentStockEl = document.getElementById('stockin-current-stock');
    const costInput = document.getElementById('stockin-cost');
    const sellInput = document.getElementById('stockin-sell');
    const batchInput = document.getElementById('stockin-batch');
    const expiryInput = document.getElementById('stockin-expiry');

    if (currentStockEl) currentStockEl.value = prod.stock || 0;
    if (costInput) costInput.value = parseFloat(prod.purchasePrice || prod.price || 0).toFixed(2);
    if (sellInput) sellInput.value = parseFloat(prod.salePrice || prod.mrp || prod.price || 0).toFixed(2);
    if (batchInput) batchInput.value = prod.batch || '';
    if (expiryInput) expiryInput.value = prod.expiry || '';
}

function handleStockInSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('stockin-product').value;
    const prod = products.find(p => p.id === productId);
    if (!prod) {
        alert('Please select a valid product.');
        return;
    }

    const qty = parseFloat(document.getElementById('stockin-qty').value) || 0;
    if (qty <= 0) {
        alert('Please enter a quantity greater than 0.');
        return;
    }

    const cost = parseFloat(document.getElementById('stockin-cost').value) || 0;
    const sell = parseFloat(document.getElementById('stockin-sell').value) || 0;
    const batch = (document.getElementById('stockin-batch').value || '').trim();
    const expiry = (document.getElementById('stockin-expiry').value || '').trim();
    const date = document.getElementById('stockin-date').value || new Date().toISOString().split('T')[0];
    const note = (document.getElementById('stockin-note').value || '').trim();

    const prevStock = parseFloat(prod.stock) || 0;
    const newStock = prevStock + qty;

    // Mutate product stock & properties
    const pIndex = products.findIndex(p => p.id === prod.id);
    if (pIndex !== -1) {
        products[pIndex].stock = newStock;
        if (cost > 0) products[pIndex].purchasePrice = cost;
        if (sell > 0) {
            products[pIndex].salePrice = sell;
            products[pIndex].mrp = sell;
        }
        if (batch) products[pIndex].batch = batch;
        if (expiry) products[pIndex].expiry = expiry;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const restockedBy = sessionStorage.getItem('mediflow_user') || 'Admin';

    const logEntry = {
        id: 'STK' + Date.now(),
        date,
        time: timeStr,
        timestamp: `${date} ${timeStr}`,
        restockedBy: restockedBy,
        productId: prod.id,
        productName: prod.name,
        qty,
        prevStock,
        newStock,
        cost,
        sell,
        batch: batch || prod.batch || '',
        expiry: expiry || prod.expiry || '',
        note
    };

    stockInLogs.push(logEntry);

    localStorage.setItem('mediflow_products', JSON.stringify(products));
    localStorage.setItem('mediflow_stock_in_logs', JSON.stringify(stockInLogs));

    if (typeof syncToCloud === 'function') {
        syncToCloud('products', { data: products });
        syncToCloud('stock_in_logs', { data: stockInLogs });
    }

    e.target.reset();
    if (document.getElementById('stockin-date')) {
        document.getElementById('stockin-date').value = new Date().toISOString().split('T')[0];
    }
    renderStockInPage();
    if (typeof renderProducts === 'function') renderProducts();
    alert(`Stock updated successfully! ${prod.name}: ${prevStock} -> ${newStock}`);
}

function renderStockInHistory() {
    try {
        const tbody = document.querySelector('#stock-in-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);

        stockInLogs.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(log => {
            const tr = document.createElement('tr');
            const batchInfo = log.batch ? `<br><small style="color: var(--text-muted);">Batch: ${escapeFn(log.batch)}</small>` : '';
            const dateTime = (log.timestamp || `${log.date || ''} ${log.time || ''}`).trim() || log.date || '---';
            const userStr = log.restockedBy || 'Admin';

            tr.innerHTML = `
                <td style="padding: 8px;">${escapeFn(dateTime)}</td>
                <td style="padding: 8px;">
                    <strong>${escapeFn(log.productName)}</strong>
                    ${batchInfo}
                </td>
                <td style="padding: 8px; font-weight: 600; color: var(--success-color);">
                    +${log.qty}
                </td>
                <td style="padding: 8px;">
                    <small style="color: var(--text-muted);">${log.prevStock !== undefined ? log.prevStock : '---'}</small> &rarr; <strong>${log.newStock !== undefined ? log.newStock : '---'}</strong>
                </td>
                <td style="padding: 8px;">
                    <span class="badge" style="background: var(--primary-light, #e0f2fe); color: var(--primary-color, #0284c7); font-weight: 600;">${escapeFn(userStr)}</span>
                </td>
                <td style="padding: 8px; text-align: center;">
                    <button class="btn btn-outline" onclick="undoStockIn('${log.id}')" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger-color);" title="Undo Stock Addition">
                        <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i> Undo
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (e) {
        console.error('Error rendering stock-in history:', e);
    }
}

function undoStockIn(logId) {
    if (confirm('Are you sure you want to undo this stock-in entry? The added quantity will be deducted from product stock.')) {
        const log = stockInLogs.find(l => l.id === logId);
        if (log) {
            const pIndex = products.findIndex(p => p.id === log.productId);
            if (pIndex !== -1) {
                products[pIndex].stock = Math.max(0, (parseFloat(products[pIndex].stock) || 0) - log.qty);
            }

            stockInLogs = stockInLogs.filter(l => l.id !== logId);
            localStorage.setItem('mediflow_products', JSON.stringify(products));
            localStorage.setItem('mediflow_stock_in_logs', JSON.stringify(stockInLogs));

            if (typeof syncToCloud === 'function') {
                syncToCloud('products', { data: products });
                syncToCloud('stock_in_logs', { data: stockInLogs });
            }

            renderStockInPage();
            if (typeof renderProducts === 'function') renderProducts();
            alert('Stock-in entry undone successfully.');
        }
    }
}

function exportStockInCSV() {
    const headers = ['date', 'time', 'timestamp', 'restockedBy', 'productName', 'qty', 'prevStock', 'newStock', 'cost', 'sell', 'batch', 'expiry', 'note'];
    const csvContent = jsonToCSV(stockInLogs, headers);
    downloadBlob(csvContent, `MediFlow_StockIn_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

function exportExpensesCSV() {
    const headers = ['date', 'category', 'description', 'amount'];
    const csvContent = jsonToCSV(expenses, headers);
    downloadBlob(csvContent, `MediFlow_Expenses_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

// --- Category Management ---
function renderCategoryManagement() {
    const list = document.getElementById('category-list');
    if (!list) return;
    
    if (Array.isArray(categories)) {
        const cleanCats = categories.filter(isValidCategoryName);
        if (cleanCats.length !== categories.length) {
            categories = cleanCats;
            if (categories.length === 0) categories = ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Ointment', 'Other'];
            localStorage.setItem('mediflow_categories', JSON.stringify(categories));
            if (typeof syncToCloud === 'function') syncToCloud('categories', categories);
        }
    }
    
    list.innerHTML = categories.map(cat => `
        <div class="badge" style="background: var(--primary-light); color: var(--primary-color); padding: 5px 10px; display: flex; align-items: center; gap: 8px;">
            ${cat}
            <i data-lucide="edit-2" style="width: 12px; cursor: pointer;" onclick="editCategoryName('${cat.replace(/'/g, "\\'")}')"></i>
            <i data-lucide="x" style="width: 12px; cursor: pointer;" onclick="deleteCategory('${cat.replace(/'/g, "\\'")}')"></i>
        </div>
    `).join('');
    
    updateCategoryDropdowns();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cleanInvalidCategoriesUser() {
    if (!Array.isArray(categories)) categories = [];
    const beforeCount = categories.length;
    categories = categories.filter(isValidCategoryName);
    if (categories.length === 0) categories = ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Ointment', 'Other'];
    
    if (Array.isArray(products)) {
        products.forEach(p => {
            if (p.category && !isValidCategoryName(p.category)) {
                p.category = categories[0] || 'General';
            }
        });
        localStorage.setItem('mediflow_products', JSON.stringify(products));
    }
    
    localStorage.setItem('mediflow_categories', JSON.stringify(categories));
    if (typeof syncToCloud === 'function') syncToCloud('categories', categories);
    renderCategoryManagement();
    if (typeof renderProducts === 'function') renderProducts();
    
    const cleanedCount = Math.max(0, beforeCount - categories.length);
    alert(`Cleaned up ${cleanedCount} invalid/corrupted category entries successfully!`);
}

window.cleanInvalidCategoriesUser = cleanInvalidCategoriesUser;

function updateCategoryDropdowns() {
    const pCatSelect = document.getElementById('p-category');
    if (pCatSelect) {
        const currentVal = pCatSelect.value;
        pCatSelect.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (categories.includes(currentVal)) pCatSelect.value = currentVal;
    }
}

function addCategory() {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    
    if (!name) return;
    if (!isValidCategoryName(name)) {
        alert('Invalid category name! Please enter a normal name.');
        return;
    }
    if (categories.includes(name)) {
        alert('Category already exists!');
        return;
    }
    
    categories.push(name);
    saveCategories();
    input.value = '';
    renderCategoryManagement();
}

function editCategoryName(oldName) {
    const newName = prompt('Enter new name for category:', oldName);
    if (!newName || newName.trim() === oldName) return;
    
    const trimmedNewName = newName.trim();
    if (!isValidCategoryName(trimmedNewName)) {
        alert('Invalid category name! Please enter a valid name.');
        return;
    }
    if (categories.includes(trimmedNewName)) {
        alert('Category name already exists!');
        return;
    }
    
    // Update category list
    const index = categories.indexOf(oldName);
    if (index !== -1) {
        categories[index] = trimmedNewName;
        
        // Update all products using this category
        products.forEach(p => {
            if (p.category === oldName) p.category = trimmedNewName;
        });
        
        saveCategories();
        localStorage.setItem('mediflow_products', JSON.stringify(products));
        renderCategoryManagement();
        renderProducts();
    }
}

function deleteCategory(name) {
    if (categories.length <= 1) {
        alert('Must have at least one category.');
        return;
    }
    
    const count = products.filter(p => p.category === name).length;
    if (count > 0) {
        if (!confirm(`There are ${count} products using this category. Deleting it will set them to "${categories[0] === name ? categories[1] : categories[0]}". Continue?`)) {
            return;
        }
        
        const fallback = categories[0] === name ? categories[1] : categories[0];
        products.forEach(p => {
            if (p.category === name) p.category = fallback;
        });
        localStorage.setItem('mediflow_products', JSON.stringify(products));
        renderProducts();
    }
    
    categories = categories.filter(c => c !== name);
    saveCategories();
    renderCategoryManagement();
}

function saveCategories() {
    categories = categories.filter(isValidCategoryName);
    localStorage.setItem('mediflow_categories', JSON.stringify(categories));
    if (typeof syncToCloud === 'function') syncToCloud('categories', categories);
}

// --- Expense Categories Management ---
function renderExpenseCategoryManagement() {
    const list = document.getElementById('expense-category-list');
    if (!list) return;
    
    list.innerHTML = expenseCategories.map(cat => `
        <div class="badge" style="background: var(--warning-light); color: var(--warning-color); padding: 5px 10px; display: flex; align-items: center; gap: 8px;">
            ${cat}
            <i data-lucide="edit-2" style="width: 12px; cursor: pointer;" onclick="editExpenseCategoryName('${cat}')"></i>
            <i data-lucide="x" style="width: 12px; cursor: pointer;" onclick="deleteExpenseCategory('${cat}')"></i>
        </div>
    `).join('');
    
    updateExpenseCategoryDropdowns();
    lucide.createIcons();
}

function updateExpenseCategoryDropdowns() {
    const expCatSelect = document.getElementById('exp-category');
    if (expCatSelect) {
        const currentVal = expCatSelect.value;
        const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);
        let html = '<option value="">Select Category...</option>';
        html += expenseCategories.map(cat => `<option value="${escapeFn(cat)}">${escapeFn(cat)}</option>`).join('');
        html += '<option value="ADD_NEW">+ Type New Custom Category...</option>';
        expCatSelect.innerHTML = html;
        if (expenseCategories.includes(currentVal)) expCatSelect.value = currentVal;
    }
}

function onExpenseCategorySelect(val) {
    const customInput = document.getElementById('exp-custom-category');
    if (val === 'ADD_NEW') {
        if (customInput) {
            customInput.style.display = 'block';
            customInput.focus();
        }
    } else {
        if (customInput) {
            customInput.style.display = customInput.value ? 'block' : 'none';
        }
    }
}

function toggleCustomExpenseCategoryInput() {
    const customInput = document.getElementById('exp-custom-category');
    const select = document.getElementById('exp-category');
    if (customInput) {
        if (customInput.style.display === 'none' || !customInput.style.display) {
            customInput.style.display = 'block';
            if (select) select.value = 'ADD_NEW';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
        }
    }
}

function addExpenseCategory() {
    const input = document.getElementById('new-exp-category-name');
    const name = input.value.trim();
    
    if (!name) return;
    if (expenseCategories.includes(name)) {
        alert('Category already exists!');
        return;
    }
    
    expenseCategories.push(name);
    saveExpenseCategories();
    input.value = '';
    renderExpenseCategoryManagement();
}

function editExpenseCategoryName(oldName) {
    const newName = prompt('Enter new name for expense category:', oldName);
    if (!newName || newName.trim() === oldName) return;
    
    const trimmedNewName = newName.trim();
    if (expenseCategories.includes(trimmedNewName)) {
        alert('Category name already exists!');
        return;
    }
    
    const index = expenseCategories.indexOf(oldName);
    if (index !== -1) {
        expenseCategories[index] = trimmedNewName;
        
        expenses.forEach(e => {
            if (e.category === oldName) e.category = trimmedNewName;
        });
        
        saveExpenseCategories();
        localStorage.setItem('mediflow_expenses', JSON.stringify(expenses));
        renderExpenseCategoryManagement();
        renderExpenses();
    }
}

function deleteExpenseCategory(name) {
    if (expenseCategories.length <= 1) {
        alert('Must have at least one expense category.');
        return;
    }
    
    const count = expenses.filter(e => e.category === name).length;
    if (count > 0) {
        if (!confirm(`There are ${count} expenses using this category. Deleting it will set them to "${expenseCategories[0] === name ? expenseCategories[1] : expenseCategories[0]}". Continue?`)) {
            return;
        }
        
        const fallback = expenseCategories[0] === name ? expenseCategories[1] : expenseCategories[0];
        expenses.forEach(e => {
            if (e.category === name) e.category = fallback;
        });
        localStorage.setItem('mediflow_expenses', JSON.stringify(expenses));
        renderExpenses();
    }
    
    expenseCategories = expenseCategories.filter(c => c !== name);
    saveExpenseCategories();
    renderExpenseCategoryManagement();
}

function saveExpenseCategories() {
    localStorage.setItem('mediflow_expense_categories', JSON.stringify(expenseCategories));
}

// --- Customer Management ---
function renderCustomers() {
    const tbody = document.querySelector('#customers-table tbody');
    if (!tbody) return;
    
    // Calculate summaries from sales first
    const customerSummaries = {};
    sales.forEach(s => {
        if (!s.customer || !s.customer.phone) return;
        const phone = s.customer.phone;
        if (!customerSummaries[phone]) {
            customerSummaries[phone] = { paid: 0, credit: 0, returned: 0 };
        }
        if (s.paymentMode === 'Credit') {
            customerSummaries[phone].credit += (parseFloat(s.grandTotal) || 0);
        } else {
            customerSummaries[phone].paid += (parseFloat(s.grandTotal) || 0);
        }
    });

    // Substract actual payments made
    customerPayments.forEach(p => {
        const phone = p.customerPhone;
        if (customerSummaries[phone]) {
            customerSummaries[phone].returned += parseFloat(p.amount);
            customerSummaries[phone].credit -= parseFloat(p.amount);
        }
    });

    const queryInput = document.getElementById('customer-list-search');
    const query = queryInput ? queryInput.value.toLowerCase() : '';
    const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.phone.includes(query)
    );

    tbody.innerHTML = filtered.map(c => {
        const summary = customerSummaries[c.phone] || { paid: 0, credit: 0 };
        return `
            <tr>
                <td>${c.name}</td>
                <td>${c.phone}</td>
                <td>${c.visits || 0}</td>
                <td>${settings.currency}${parseFloat(c.totalSpent || 0).toFixed(2)}</td>
                <td style="color: #16a34a; font-weight: 600;">${settings.currency}${(summary.paid + summary.returned).toFixed(2)}</td>
                <td style="color: #dc2626; font-weight: 600;">${settings.currency}${summary.credit.toFixed(2)}</td>
                <td>
                    <button class="btn btn-outline" onclick="openPaymentModal('${c.id}')" title="Return Amount" style="padding: 5px; color: #16a34a; border-color: #16a34a;"><i data-lucide="arrow-down-to-dot" style="width: 14px;"></i></button>
                    <button class="btn btn-outline" onclick="editCustomer('${c.id}')" style="padding: 5px;"><i data-lucide="edit-2" style="width: 14px;"></i></button>
                    ${sessionStorage.getItem('mediflow_user') === 'VIKI' ? `<button class="btn btn-outline" onclick="deleteCustomer('${c.id}')" style="padding: 5px; color: var(--danger-color);"><i data-lucide="trash" style="width: 14px;"></i></button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

function handleCustomerSuggest(e) {
    const query = e.target.value.toLowerCase();
    const suggestions = document.getElementById('customer-suggestions');
    
    if (query.length < 1) {
        suggestions.style.display = 'none';
        customerSearchSelectedIndex = -1;
        return;
    }
    customerSearchSelectedIndex = -1;

    const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.phone.includes(query)
    ).slice(0, 5);

    if (filtered.length > 0) {
        suggestions.innerHTML = filtered.map(c => `
            <div class="search-item" onclick="selectCustomer('${c.name}', '${c.phone}')">
                <span class="name">${c.name}</span>
                <span class="details">${c.phone}</span>
            </div>
        `).join('');
        suggestions.style.display = 'block';
    } else {
        suggestions.style.display = 'none';
    }
}

function selectCustomer(name, phone) {
    document.getElementById('customer-name').value = name;
    document.getElementById('customer-phone').value = phone;
    document.getElementById('customer-suggestions').style.display = 'none';
}

function openCustomerModal(id = null) {
    const modal = document.getElementById('customer-modal');
    const title = document.getElementById('customer-modal-title');
    const form = document.getElementById('customer-form');
    
    form.reset();
    document.getElementById('edit-customer-id').value = '';
    
    if (id) {
        const c = customers.find(cust => cust.id === id);
        title.textContent = 'Edit Customer';
        document.getElementById('edit-customer-id').value = c.id;
        document.getElementById('c-name').value = c.name;
        document.getElementById('c-phone').value = c.phone;
    } else {
        title.textContent = 'Add New Customer';
    }
    
    modal.style.display = 'flex';
}

function closeCustomerModal() {
    document.getElementById('customer-modal').style.display = 'none';
}

function handleCustomerSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-customer-id').value;
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();

    if (id) {
        const index = customers.findIndex(c => c.id === id);
        customers[index] = { ...customers[index], name, phone };
    } else {
        customers.push({
            id: 'C' + Date.now(),
            name,
            phone,
            visits: 0,
            totalSpent: 0
        });
    }

    localStorage.setItem('mediflow_customers', JSON.stringify(customers));
    closeCustomerModal();
    renderCustomers();
}

function deleteCustomer(id) {
    if (confirm('Are you sure you want to delete this customer?')) {
        customers = customers.filter(c => c.id !== id);
        localStorage.setItem('mediflow_customers', JSON.stringify(customers));
        renderCustomers();
    }
}

function editCustomer(id) {
    openCustomerModal(id);
}

// --- Supplier Management ---
function renderSuppliers() {
    const tbody = document.querySelector('#suppliers-table tbody');
    if (!tbody) return;
    
    const searchInput = document.getElementById('supplier-list-search');
    let query = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = suppliers;
    if (query) {
        filtered = suppliers.filter(s => 
            s.name.toLowerCase().includes(query) || 
            s.phone.includes(query) || 
            (s.person && s.person.toLowerCase().includes(query))
        );
    }

    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No suppliers found.</td></tr>';
        return;
    }

    filtered.forEach(s => {
        let totalPurchases = 0;
        purchases.forEach(p => {
            if (p.supplier === s.name) {
                totalPurchases += (parseFloat(p.total) || 0);
            }
        });

        let totalPaid = 0;
        supplierPayments.forEach(p => {
            if (p.supplierId === s.id) {
                totalPaid += (parseFloat(p.amount) || 0);
            }
        });

        let balance = totalPurchases - totalPaid;

        const isOwe = balance > 0;
        const balanceColor = isOwe ? 'var(--danger-color)' : (balance < 0 ? 'var(--success-color)' : 'inherit');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${s.name}</strong></td>
            <td>${s.phone}</td>
            <td>${settings.currency}${totalPurchases.toFixed(2)}</td>
            <td>${settings.currency}${totalPaid.toFixed(2)}</td>
            <td style="color: ${balanceColor}; font-weight: bold;">${settings.currency}${Math.abs(balance).toFixed(2)} ${balance < 0 ? '(Adv)' : ''}</td>
            <td>
                <button class="btn btn-primary" onclick="openSupplierPaymentModal('${s.id}')" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;">Pay</button>
                <button class="btn btn-outline" onclick="openSupplierReport('${s.id}')" style="padding: 5px; margin-right: 5px;" title="Ledger Report"><i data-lucide="file-text" style="width: 14px;"></i></button>
                <button class="btn btn-outline" onclick="editSupplier('${s.id}')" style="padding: 5px; margin-right: 5px;"><i data-lucide="edit-2" style="width: 14px;"></i></button>
                ${sessionStorage.getItem('mediflow_user') === 'VIKI' ? `<button class="btn btn-outline" onclick="deleteSupplier('${s.id}')" style="padding: 5px; color: var(--danger-color);"><i data-lucide="trash" style="width: 14px;"></i></button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function openSupplierModal(id = null) {
    const modal = document.getElementById('supplier-modal');
    const title = document.getElementById('supplier-modal-title');
    const form = document.getElementById('supplier-form');
    
    form.reset();
    document.getElementById('edit-supplier-id').value = '';
    
    if (id) {
        const s = suppliers.find(sup => sup.id === id);
        title.textContent = 'Edit Supplier';
        document.getElementById('edit-supplier-id').value = s.id;
        document.getElementById('s-name').value = s.name;
        document.getElementById('s-person').value = s.person || '';
        document.getElementById('s-phone').value = s.phone || '';
        document.getElementById('s-email').value = s.email || '';
        document.getElementById('s-gstin').value = s.gstin || '';
        document.getElementById('s-address').value = s.address || '';
    } else {
        title.textContent = 'Add New Supplier';
    }
    
    modal.style.display = 'flex';
}

function closeSupplierModal() {
    document.getElementById('supplier-modal').style.display = 'none';
}

function handleSupplierSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-supplier-id').value;
    
    const supplierData = {
        name: document.getElementById('s-name').value.trim(),
        person: document.getElementById('s-person').value.trim(),
        phone: document.getElementById('s-phone').value.trim(),
        email: document.getElementById('s-email').value.trim(),
        gstin: document.getElementById('s-gstin').value.trim(),
        address: document.getElementById('s-address').value.trim()
    };

    if (id) {
        const index = suppliers.findIndex(s => s.id === id);
        suppliers[index] = { ...suppliers[index], ...supplierData };
    } else {
        supplierData.id = 'SUP' + Date.now();
        suppliers.push(supplierData);
    }

    localStorage.setItem('mediflow_suppliers', JSON.stringify(suppliers));
    closeSupplierModal();
    renderSuppliers();
    if (activeSection === 'purchase') renderSupplierDropdown();
}

function deleteSupplier(id) {
    if (confirm('Are you sure you want to delete this supplier?')) {
        suppliers = suppliers.filter(s => s.id !== id);
        localStorage.setItem('mediflow_suppliers', JSON.stringify(suppliers));
        renderSuppliers();
        if (activeSection === 'purchase') renderSupplierDropdown();
    }
}

function editSupplier(id) {
    openSupplierModal(id);
}

function renderSupplierDropdown() {
    const sSelect = document.getElementById('pur-supplier');
    const singleSelect = document.getElementById('pur-single-supplier');
    const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);
    const optionsHtml = '<option value="">Select Supplier (Optional)</option>' + 
        suppliers.map(s => `<option value="${escapeFn(s.name)}">${escapeFn(s.name)}</option>`).join('');

    if (sSelect) {
        const currentVal = sSelect.value;
        sSelect.innerHTML = optionsHtml;
        if (suppliers.some(s => s.name === currentVal)) sSelect.value = currentVal;
    }
    if (singleSelect) {
        const currentVal = singleSelect.value;
        singleSelect.innerHTML = optionsHtml;
        if (suppliers.some(s => s.name === currentVal)) singleSelect.value = currentVal;
    }
}

// --- Supplier Payments & Ledger ---
function openSupplierPaymentModal(id) {
    const s = suppliers.find(sup => sup.id === id);
    if (!s) return;

    document.getElementById('spay-supplier-id').value = s.id;
    document.getElementById('spay-supplier-name').value = s.name;
    document.getElementById('spay-amount').value = '';
    document.getElementById('supplier-payment-modal').style.display = 'flex';
}

function closeSupplierPaymentModal() {
    document.getElementById('supplier-payment-modal').style.display = 'none';
}

function handleSupplierPaymentSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('spay-supplier-id').value;
    const amount = parseFloat(document.getElementById('spay-amount').value);
    const method = document.getElementById('spay-method').value;

    const s = suppliers.find(sup => sup.id === id);
    if (s && amount > 0) {
        supplierPayments.push({
            id: 'SP' + Date.now(),
            supplierId: s.id,
            supplierName: s.name,
            amount: amount,
            method: method,
            date: new Date().toISOString()
        });

        localStorage.setItem('mediflow_supplier_payments', JSON.stringify(supplierPayments));
        
        closeSupplierPaymentModal();
        renderSuppliers();
        alert(`Payment of ${settings.currency}${amount} to ${s.name} recorded!`);
    }
}

function openSupplierReport(id) {
    const s = suppliers.find(sup => sup.id === id);
    if (!s) return;

    document.getElementById('report-supplier-name').textContent = s.name;
    document.getElementById('report-supplier-phone').textContent = `Ph: ${s.phone} ${s.gstin ? ' | GSTIN: ' + s.gstin : ''}`;

    const tbody = document.querySelector('#supplier-ledger-table tbody');
    tbody.innerHTML = '';

    // Collect transactions
    const transactions = [];
    
    // 1. Add Purchases
    purchases.forEach(p => {
        if (p.supplier === s.name) {
            transactions.push({
                date: new Date(p.date),
                desc: 'Purchase',
                ref: `Inv: ${p.invoice || '-'}`,
                debit: parseFloat(p.total) || 0,
                credit: 0
            });
        }
    });

    // 2. Add Payments
    supplierPayments.forEach(p => {
        if (p.supplierId === s.id) {
            transactions.push({
                date: new Date(p.date),
                desc: 'Payment',
                ref: p.method,
                debit: 0,
                credit: parseFloat(p.amount) || 0
            });
        }
    });

    // Sort by date ascending
    transactions.sort((a, b) => a.date - b.date);

    let runningBalance = 0;
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">No transactions found for this supplier.</td></tr>';
        document.getElementById('report-supplier-balance').textContent = `${settings.currency}0.00`;
        document.getElementById('supplier-report-modal').style.display = 'flex';
        return;
    }

    transactions.forEach(t => {
        runningBalance += t.debit;
        runningBalance -= t.credit;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date.toLocaleDateString()}</td>
            <td>${t.desc}</td>
            <td>${t.ref}</td>
            <td style="text-align: right;">${t.debit > 0 ? settings.currency + t.debit.toFixed(2) : '-'}</td>
            <td style="text-align: right; color: var(--success-color);">${t.credit > 0 ? settings.currency + t.credit.toFixed(2) : '-'}</td>
            <td style="text-align: right; font-weight: bold;">${settings.currency}${runningBalance.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    const isOwe = runningBalance > 0;
    const balanceColor = isOwe ? 'var(--danger-color)' : (runningBalance < 0 ? 'var(--success-color)' : 'var(--text-color)');
    
    const balanceEl = document.getElementById('report-supplier-balance');
    balanceEl.textContent = `${settings.currency}${Math.abs(runningBalance).toFixed(2)} ${runningBalance < 0 ? '(Advance)' : ''}`;
    balanceEl.style.color = balanceColor;

    document.getElementById('supplier-report-modal').style.display = 'flex';
}

function closeSupplierReport() {
    document.getElementById('supplier-report-modal').style.display = 'none';
}

function printSupplierReport() {
    const sName = document.getElementById('report-supplier-name').textContent;
    const sPhone = document.getElementById('report-supplier-phone').textContent;
    const balance = document.getElementById('report-supplier-balance').textContent;
    const tableHTML = document.getElementById('supplier-ledger-table').outerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Supplier Report - ${sName}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { margin-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f4f4f4; }
                .right { text-align: right; }
                @media print {
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>${settings.shopName}</h1>
            <h2>Supplier Ledger Report</h2>
            <p><strong>Supplier:</strong> ${sName}<br>
            ${sPhone}<br>
            <strong>Date:</strong> ${new Date().toLocaleString()}</p>
            <h3 style="color: ${document.getElementById('report-supplier-balance').style.color};">Current Balance: ${balance}</h3>
            ${tableHTML}
            <br>
            <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Print Report</button>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function sendWhatsAppBill(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    let message = `*${settings.shopName.toUpperCase()} - INVOICE*\n`;
    message += `Inv: #${sale.invoiceNo} | Date: ${new Date(sale.date).toLocaleDateString()}\n`;
    message += `Cust: ${sale.customer.name}\n\n`;

    sale.items.forEach(item => {
        message += `• ${item.name} (${item.qty} x ${item.salePrice}) = *${settings.currency}${(item.qty * item.salePrice).toFixed(2)}*\n`;
    });

    let subInfo = `\nGST: ${settings.currency}${sale.gst.toFixed(2)}`;
    if (sale.discount > 0) subInfo += ` | Disc: ${settings.currency}${sale.discount.toFixed(2)}`;
    message += `${subInfo}\n`;
    message += `*TOTAL: ${settings.currency}${sale.grandTotal.toFixed(2)} (${sale.paymentMode || 'Cash'})*\n\n`;
    message += `Thank you for choosing ${settings.shopName}! 🙏`;

    const phoneNumber = sale.customer.phone.replace(/\D/g, '');
    const cleanPhone = (phoneNumber.startsWith('91') || phoneNumber.length === 0) ? phoneNumber : '91' + phoneNumber;
    if (cleanPhone === '') {
        alert('No valid phone number found for this customer!');
        return;
    }
    
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

function openPaymentModal(customerId) {
    const c = customers.find(cust => cust.id === customerId);
    if (!c) return;

    document.getElementById('pay-customer-id').value = c.id;
    document.getElementById('pay-customer-name').value = c.name;
    document.getElementById('pay-amount').value = '';
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
}

function handlePaymentSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('pay-customer-id').value;
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;

    const c = customers.find(cust => cust.id === id);
    if (c && amount > 0) {
        customerPayments.push({
            id: 'P' + Date.now(),
            customerId: c.id,
            customerName: c.name,
            customerPhone: c.phone,
            amount: amount,
            method: method,
            date: new Date().toISOString()
        });

        localStorage.setItem('mediflow_customer_payments', JSON.stringify(customerPayments));
        
        // Record as a "Sales Entry" or just let the ledger handle it.
        // Actually, let's keep it separate for the ledger.
        
        closePaymentModal();
        renderCustomers();
        alert(`Payment of ${settings.currency}${amount} recorded for ${c.name}`);
    }
}

// --- Admin Management ---
function openAdminModal() {
    if (sessionStorage.getItem('mediflow_user') !== 'VIKI') {
        alert('Access Denied: Only the Super Admin (VIKI) can create new Accounts.');
        return;
    }
    
    document.getElementById('admin-edit-id').value = '';
    const modalTitle = document.getElementById('admin-modal-title');
    if (modalTitle) modalTitle.textContent = 'Provision New User';
    const modalSubmit = document.getElementById('admin-modal-submit');
    if (modalSubmit) modalSubmit.textContent = 'Create Account';
    
    document.getElementById('admin-user').value = '';
    document.getElementById('admin-pass').value = '';
    const roleSelect = document.getElementById('admin-role');
    if (roleSelect) roleSelect.value = 'staff';
    
    const branchSelect = document.getElementById('admin-branch');
    if (branchSelect) {
        branchSelect.innerHTML = '';
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            branchSelect.appendChild(opt);
        });
    }
    document.getElementById('admin-modal').style.display = 'flex';
}

function closeAdminModal() {
    document.getElementById('admin-modal').style.display = 'none';
}

function handleAdminSubmit(e) {
    e.preventDefault();
    
    if (sessionStorage.getItem('mediflow_user') !== 'VIKI') {
        alert('Only the Super Admin (VIKI) can manage user accounts.');
        return;
    }

    const editId = document.getElementById('admin-edit-id').value;
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();
    const roleSelect = document.getElementById('admin-role');
    const role = roleSelect ? roleSelect.value : 'staff';
    const branchSelect = document.getElementById('admin-branch');
    const branchId = branchSelect ? branchSelect.value : 'branch_default';

    if (editId) {
        const existingAdmin = admins.find(a => a.id === editId);
        if (existingAdmin) {
            if (existingAdmin.username !== user && admins.some(a => a.username === user)) {
                alert('Username already exists!');
                return;
            }
            existingAdmin.username = user;
            existingAdmin.password = pass;
            existingAdmin.role = role;
            existingAdmin.branchId = branchId;
        }
        alert('Account updated successfully!');
    } else {
        if (admins.some(a => a.username === user)) {
            alert('Username already exists!');
            return;
        }
        admins.push({
            id: 'A' + Date.now(),
            username: user,
            password: pass,
            role: role,
            branchId: branchId
        });
        alert('Account created successfully!');
    }

    localStorage.setItem('mediflow_admins', JSON.stringify(admins));
    closeAdminModal();
    renderAdmins();
    syncToCloud('admins', { data: admins });
}

function editAdmin(id) {
    if (sessionStorage.getItem('mediflow_user') !== 'VIKI') {
        alert('Access Denied: Only the Super Admin (VIKI) can edit Accounts.');
        return;
    }
    const admin = admins.find(a => a.id === id);
    if (!admin) return;

    document.getElementById('admin-edit-id').value = admin.id;
    const modalTitle = document.getElementById('admin-modal-title');
    if (modalTitle) modalTitle.textContent = 'Edit User Account';
    const modalSubmit = document.getElementById('admin-modal-submit');
    if (modalSubmit) modalSubmit.textContent = 'Save Changes';

    document.getElementById('admin-user').value = admin.username;
    document.getElementById('admin-pass').value = admin.password;
    
    const roleSelect = document.getElementById('admin-role');
    if (roleSelect) roleSelect.value = admin.role;
    
    const branchSelect = document.getElementById('admin-branch');
    if (branchSelect) {
        branchSelect.innerHTML = '';
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            if (b.id === admin.branchId) opt.selected = true;
            branchSelect.appendChild(opt);
        });
    }
    
    document.getElementById('admin-modal').style.display = 'flex';
}

function renderAdmins() {
    const tbody = document.querySelector('#admins-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const trSuper = document.createElement('tr');
    trSuper.innerHTML = `
        <td><strong>VIKI</strong></td>
        <td><span class="badge" style="background: var(--warning-color); color: white;">Super Admin</span></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">Protected (Master)</span></td>
        <td style="text-align: right;"><span style="font-size: 0.8rem; color: var(--text-muted);">Has access to all branches</span></td>
    `;
    tbody.appendChild(trSuper);

    if (admins.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.innerHTML = '<td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">No additional staff or admin accounts found. Click "Create New User" to add one.</td>';
        tbody.appendChild(emptyTr);
    } else {
        admins.forEach(a => {
            const tr = document.createElement('tr');
            const badgeStyle = a.role === 'admin' ? 'background: var(--primary-light); color: var(--primary-color);' : 'background: #e2e8f0; color: #475569;';
            const displayRole = a.role === 'admin' ? 'Admin' : 'Staff';
            const branchName = branches.find(b => b.id === a.branchId)?.name || 'Unknown Branch';
            const escapedPass = escapeHtml(a.password || '');
            
            tr.innerHTML = `
                <td>${escapeHtml(a.username)} <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(branchName)}</div></td>
                <td><span class="badge" style="${badgeStyle}">${displayRole}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span id="pass-display-${a.id}" style="font-family: monospace; font-weight: 600; font-size: 0.9rem;">••••••••</span>
                        <button class="btn btn-outline" onclick="toggleAdminTablePassVisibility('${a.id}', '${escapedPass}')" style="padding: 3px 6px; font-size: 0.75rem;" title="Show/Hide Password">
                            <i data-lucide="eye" id="pass-icon-${a.id}" style="width: 13px; height: 13px;"></i> <span id="pass-lbl-${a.id}">Show</span>
                        </button>
                    </div>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 5px; justify-content: flex-end;">
                        <button class="btn btn-outline" onclick="editAdmin('${a.id}')" style="padding: 5px; color: var(--primary-color);" title="Edit"><i data-lucide="edit-2" style="width: 14px;"></i></button>
                        <button class="btn btn-outline" onclick="deleteAdmin('${a.id}')" style="padding: 5px; color: var(--danger-color);" title="Delete"><i data-lucide="trash" style="width: 14px;"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleAdminModalPassVisibility() {
    const input = document.getElementById('admin-pass');
    const icon = document.getElementById('admin-modal-pass-icon');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleAdminTablePassVisibility(adminId, rawPass) {
    const passSpan = document.getElementById(`pass-display-${adminId}`);
    const passLbl = document.getElementById(`pass-lbl-${adminId}`);
    const passIcon = document.getElementById(`pass-icon-${adminId}`);
    if (!passSpan) return;

    if (passSpan.getAttribute('data-shown') === 'true') {
        passSpan.textContent = '••••••••';
        passSpan.removeAttribute('data-shown');
        if (passLbl) passLbl.textContent = 'Show';
        if (passIcon) passIcon.setAttribute('data-lucide', 'eye');
    } else {
        passSpan.textContent = rawPass || '---';
        passSpan.setAttribute('data-shown', 'true');
        if (passLbl) passLbl.textContent = 'Hide';
        if (passIcon) passIcon.setAttribute('data-lucide', 'eye-off');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.toggleAdminModalPassVisibility = toggleAdminModalPassVisibility;
window.toggleAdminTablePassVisibility = toggleAdminTablePassVisibility;

function deleteAdmin(id) {
    if (!requireSuperAdmin('deleteAdmin')) return;
    if (confirm('Are you sure you want to delete this account?')) {
        admins = admins.filter(a => a.id !== id);
        localStorage.setItem('mediflow_admins', JSON.stringify(admins));
        renderAdmins();
        syncToCloud('admins', { data: admins });
    }
}

// --- Branch Management ---
function renderBranches() {
    const tbody = document.querySelector('#branches-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    branches.forEach(b => {
        const tr = document.createElement('tr');

        const branchAmc = typeof getBranchAMC === 'function' ? getBranchAMC(b.id) : null;
        const isLocked = !!(b.isLocked || (branchAmc && branchAmc.isLocked));

        const statusBadge = isLocked 
            ? '<span class="badge" style="background:#fee2e2; color:#dc2626;">🔒 Locked</span>' 
            : '<span class="badge" style="background:#dcfce7; color:#16a34a;">✓ Active</span>';

        let amcStatusHtml = '<span class="badge" style="background:#f1f5f9; color:#64748b;">Not Set</span>';
        try {
            if (branchAmc && branchAmc.expiryDate) {
                const now = new Date();
                const expiry = new Date(branchAmc.expiryDate);
                const diffTime = expiry - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isUnlimited = (branchAmc.planName && (branchAmc.planName.toLowerCase().includes('unlimited') || branchAmc.planName.toLowerCase().includes('lifetime'))) || diffDays > 3000;

                if (isUnlimited) {
                    amcStatusHtml = '<span class="badge" style="background:#dcfce7; color:#16a34a;">Lifetime / Unlimited</span>';
                } else if (diffDays < 0) {
                    amcStatusHtml = '<span class="badge" style="background:#fee2e2; color:#dc2626;">Expired</span>';
                } else if (diffDays <= 15) {
                    amcStatusHtml = `<span class="badge" style="background:#fef08a; color:#a16207;">${diffDays} Days Left</span>`;
                } else {
                    amcStatusHtml = `<span class="badge" style="background:#dcfce7; color:#16a34a;">${diffDays} Days Left (${branchAmc.planName || 'Plan'})</span>`;
                }
            } else if (branchAmc && branchAmc.planName) {
                amcStatusHtml = `<span class="badge" style="background:#dcfce7; color:#16a34a;">${branchAmc.planName}</span>`;
            }
        } catch (e) {}

        tr.innerHTML = `
            <td><strong>${b.name}</strong></td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569;">${b.id}</span></td>
            <td>${b.location || '-'}</td>
            <td>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.78rem; color: var(--primary-color); border-color: var(--primary-color);" title="Copy Menu Link" onclick="copyBranchMenuLink('${b.id}')">
                        <i data-lucide="copy" style="width: 13px;"></i> Copy
                    </button>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.78rem; color: #16a34a; border-color: #16a34a;" title="Share WhatsApp" onclick="shareBranchMenuWhatsApp('${b.id}')">
                        <i data-lucide="share-2" style="width: 13px;"></i> WhatsApp
                    </button>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.78rem; color: #0284c7; border-color: #0284c7;" title="Open Menu Card" onclick="openBranchMenuLink('${b.id}')">
                        <i data-lucide="external-link" style="width: 13px;"></i> Open
                    </button>
                </div>
            </td>
            <td>${amcStatusHtml}</td>
            <td>${statusBadge}</td>
            <td style="text-align: right; display: flex; justify-content: flex-end; gap: 0.5rem;">
                ${isLocked 
                    ? `<button class="btn btn-outline" style="padding: 5px 10px; color: #16a34a; border-color: #16a34a;" onclick="toggleBranchLock('${b.id}')">
                           <i data-lucide="unlock" style="width: 14px;"></i> Unlock
                       </button>`
                    : `<button class="btn btn-outline" style="padding: 5px 10px; color: #dc2626; border-color: #dc2626;" onclick="toggleBranchLock('${b.id}')">
                           <i data-lucide="lock" style="width: 14px;"></i> Lock
                       </button>`
                }
                <button class="btn btn-outline" style="padding: 5px 10px; color: var(--primary-color); border-color: var(--primary-color);" onclick="changeBranchAMC('${b.id}')">
                    <i data-lucide="calendar" style="width: 14px;"></i> Renew Plan
                </button>
                <button class="btn btn-outline" style="padding: 5px 10px; color: #dc2626; border-color: #dc2626;" onclick="deleteBranch('${b.id}')">
                    <i data-lucide="trash" style="width: 14px;"></i> Delete
                </button>
            </td>
        `;
        tbody.appendChild(tr);
     });
     if (typeof lucide !== 'undefined') lucide.createIcons();
 }
 
 function toggleBranchLock(id) {
     if (!requireSuperAdmin('toggleBranchLock')) return;

     const branch = branches.find(b => b.id === id);
     if (!branch) return;

     const newLockedState = !branch.isLocked;
     branch.isLocked = newLockedState;
     localStorage.setItem('mediflow_branches', JSON.stringify(branches));
     syncToCloud('branches', branches);
     auditSecurityAction(newLockedState ? 'lock_branch' : 'unlock_branch', { branchId: id });

     if (!amcData || typeof amcData !== 'object') amcData = {};
     if (!amcData.branches) amcData.branches = {};
     const currentBranchAMC = typeof getBranchAMC === 'function' ? getBranchAMC(id) : {};
     amcData.branches[id] = { ...currentBranchAMC, isLocked: newLockedState };
     localStorage.setItem('mediflow_amc', JSON.stringify(amcData));
     syncToCloud('amc', amcData);

     renderBranches();
     if (typeof onAMCBranchSelectChange === 'function') onAMCBranchSelectChange();
     checkAMCStatus();
 }
 
 function changeBranchAMC(id) {
     switchSection('settings');
     const amcSelect = document.getElementById('amc-target-branch');
     if (amcSelect) {
         amcSelect.value = id;
         if (typeof onAMCBranchSelectChange === 'function') onAMCBranchSelectChange();
     }
     const amcPlanInput = document.getElementById('set-amc-plan');
     if (amcPlanInput) {
         amcPlanInput.focus();
         amcPlanInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
     }
 }

async function deleteBranch(id) {
    if (!requireSuperAdmin('deleteBranch')) return;
    validateCurrentBranchAccess();
    if (!id || id === 'branch_default') { alert('The default Main Branch cannot be deleted.'); return; }
    const branch = branches.find(b => b.id === id);
    if (!branch) { alert('Branch not found.'); return; }
    if (!confirm(`⚠️ DELETE BRANCH

Branch: ${branch.name}
ID: ${id}

This will permanently remove this branch and its branch-specific data.

Continue?`)) return;
    try {
        branches = branches.filter(b => b.id !== id);
        localStorage.setItem('mediflow_branches', JSON.stringify(branches));
        await auditSecurityAction('delete_branch', { deletedBranchId: id, deletedBranchName: branch.name });
        branchSpecificKeys.forEach(key => localStorage.removeItem(`mediflow_${id}_${key.replace(/^mediflow_/, '')}`));
        if (amcData && typeof amcData === 'object' && amcData.branches) {
            delete amcData.branches[id];
            localStorage.setItem('mediflow_amc', JSON.stringify(amcData));
        }
        // Save the global branch registry so the deleted branch does not return on refresh.
        await syncToCloud('branches', { data: branches });
        if (amcData && typeof amcData === 'object') await syncToCloud('amc', amcData);
        // Delete all branch-scoped Firestore documents too.
        if (isFirebaseEnabled && db) {
            const collections = ['products','sales','settings','purchases','expenses','categories','expense_categories','customers','suppliers',
                'supplier_payments','customer_payments','staff','attendance','staff_advances','salary_payments','digital_orders','doctors',
                'held_carts','tables','stock_in_logs','cake_flavors','cancelled_digital_orders'];
            await Promise.all(collections.map(col => db.collection('mediflow_data').doc(`${id}_${col}`).delete()));
        }
        if (sessionStorage.getItem('mediflow_current_branch') === id) sessionStorage.setItem('mediflow_current_branch', branches[0]?.id || 'branch_default');
        renderBranches();
        setupGlobalBranchSelector('superadmin');
        alert(`Branch "${branch.name}" deleted successfully.`);
        window.location.reload();
    } catch (e) {
        console.error('Branch deletion failed:', e);
        alert('Branch deletion failed: ' + (e?.message || e));
    }
}

function openBranchModal() {
    document.getElementById('branch-name').value = '';
    document.getElementById('branch-location').value = '';
    document.getElementById('branch-modal').style.display = 'flex';
}

function closeBranchModal() {
    document.getElementById('branch-modal').style.display = 'none';
}

document.getElementById('branch-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!requireSuperAdmin('createBranch')) return;
    const name = document.getElementById('branch-name').value;
    const location = document.getElementById('branch-location').value;
    const newId = 'branch_' + Date.now();
    branches.push({ id: newId, name: name, location: location, branchId: newId, createdAt: new Date().toISOString(), createdBy: getCurrentActor().username });
    localStorage.setItem('mediflow_branches', JSON.stringify(branches));
    syncToCloud('branches', { data: branches });
    auditSecurityAction('create_branch', { branchId: newId, branchName: name });
    closeBranchModal();
    renderBranches();
    
    // Refresh branch selectors
    setupGlobalBranchSelector('superadmin');
    alert('Branch created successfully!');
});

// Initial Render
document.addEventListener('DOMContentLoaded', () => {
    renderBranches();
});

// Immediately kick users in other tabs if their branch is locked
window.addEventListener('storage', (e) => {
    if (e.key === 'mediflow_branches') {
        const updatedBranches = JSON.parse(e.newValue || '[]');
        const currentId = sessionStorage.getItem('mediflow_current_branch') || 'branch_default';
        const currentBranch = updatedBranches.find(b => b.id === currentId);
        if (currentBranch && currentBranch.isLocked && sessionStorage.getItem('mediflow_logged_in') === 'true') {
            // Update local memory and trigger lock screen
            branches = updatedBranches;
            checkLoginStatus();
        }
    }
    
    if (e.key === getPendingOrdersKey() || e.key === 'mediflow_digital_orders') {
        if (typeof renderDigitalOrders === 'function') renderDigitalOrders();
    }
});

// --- Digital Menu Card Module ---
let activeMenuCategory = 'ALL';
let activeMenuViewMode = 'grid';

function isMenuAdminView() {
    if (typeof isCustomerViewActive !== 'undefined' && isCustomerViewActive || (document.body && document.body.classList.contains('customer-mode'))) return false;
    const loggedInUser = sessionStorage.getItem('mediflow_user');
    const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
    return loggedInUser && (
        loggedInUser === 'VIKI' || loggedInUser.toLowerCase() === 'viki' ||
        userRole === 'super_admin' || userRole === 'Super Admin' ||
        userRole === 'admin' || userRole === 'Admin' ||
        loggedInUser === 'superadmin' || loggedInUser === 'admin'
    );
}

function toggleMenuShowStock(productId) {
    const idx = products.findIndex(p => p.id === productId);
    if (idx < 0) return;
    products[idx].menuShowStock = !products[idx].menuShowStock;
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    syncToCloud('products', products);
    renderMenuCard();
}

function toggleMenuNotAvailableToday(productId) {
    const idx = products.findIndex(p => p.id === productId);
    if (idx < 0) return;
    const today = new Date().toDateString();
    if (products[idx].menuNotAvailableDate === today) {
        products[idx].menuNotAvailableDate = null; // Remove — make available again
    } else {
        products[idx].menuNotAvailableDate = today; // Mark not available today
    }
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    syncToCloud('products', products);
    renderMenuCard();
}

function showMenuLoadingScreen(title, sub) {
    const overlay = document.getElementById('menu-loading-overlay');
    if (!overlay) return;
    if (title) {
        const titleEl = document.getElementById('menu-loader-title');
        if (titleEl) titleEl.textContent = title;
    }
    if (sub) {
        const subEl = document.getElementById('menu-loader-sub');
        if (subEl) subEl.textContent = sub;
    }
    overlay.classList.remove('hidden');
}

function hideMenuLoadingScreen() {
    const overlay = document.getElementById('menu-loading-overlay');
    if (overlay) {
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 120);
    }
}

function showMenuCardSkeleton() {
    const container = document.getElementById('menu-card-content');
    if (!container) return;
    let skeletonHtml = '';
    for (let i = 0; i < 6; i++) {
        skeletonHtml += `
            <div class="menu-skeleton-card">
                <div class="skeleton-bar" style="height: 18px; width: 65%;"></div>
                <div class="skeleton-bar" style="height: 14px; width: 35%;"></div>
                <div style="display: flex; justify-content: space-between; margin-top: 10px; align-items: center;">
                    <div class="skeleton-bar" style="height: 22px; width: 35%;"></div>
                    <div class="skeleton-bar" style="height: 32px; width: 70px; border-radius: 8px;"></div>
                </div>
            </div>
        `;
    }
    container.innerHTML = skeletonHtml;
}

function renderMenuCard(query) {
    const container = document.getElementById('menu-card-content');
    const searchInput = document.getElementById('menu-card-search');
    const clearBtn = document.getElementById('menu-search-clear');
    if (!container) return;

    const searchQuery = (query !== undefined ? query : (searchInput ? searchInput.value : '')).toLowerCase().trim();
    const isAdmin = isMenuAdminView();
    const today = new Date().toDateString();

    if (clearBtn) {
        clearBtn.style.display = searchQuery.length > 0 ? 'flex' : 'none';
    }

    // 1. Calculate KPI Metrics
    const totalCount = products.length;
    const inStockCount = products.filter(p => (p.stock || 0) > 0 || (p.stock >= 999999)).length;
    const categorySet = new Set(products.map(p => p.category || 'General'));
    
    const kpiTotal = document.getElementById('menu-kpi-total');
    const kpiInStock = document.getElementById('menu-kpi-instock');
    const kpiCats = document.getElementById('menu-kpi-categories');
    if (kpiTotal) kpiTotal.textContent = totalCount;
    if (kpiInStock) kpiInStock.textContent = inStockCount;
    if (kpiCats) kpiCats.textContent = categorySet.size;

    // 2. Render Category Pills Bar
    renderCategoryPills(categorySet);

    // 3. Filter Products
    let filteredProducts = products.filter(p => {
        const matchesSearch = searchQuery === '' || 
            (p.name && p.name.toLowerCase().includes(searchQuery)) ||
            (p.category && String(p.category).toLowerCase().includes(searchQuery)) ||
            (p.barcode && String(p.barcode).toLowerCase().includes(searchQuery)) ||
            (p.hsn && String(p.hsn).toLowerCase().includes(searchQuery));

        if (!matchesSearch) return false;

        if (activeMenuCategory === 'INSTOCK') {
            return (p.stock || 0) > 0 || (p.stock >= 999999);
        } else if (activeMenuCategory !== 'ALL') {
            return (p.category || 'General') === activeMenuCategory;
        }
        return true;
    });

    filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
    container.className = `menu-card-content ${activeMenuViewMode}-layout`;

    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: var(--card-bg); border: 1px dashed var(--border-color); border-radius: 16px; color: var(--text-muted);">
                <i data-lucide="package-search" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--text-muted);"></i>
                <h4 style="color: var(--text-main); margin-bottom: 4px; font-size: 1.1rem;">No products found</h4>
                <p style="font-size: 0.85rem;">Try adjusting your search query or category filter.</p>
            </div>
        `;
        lucide.createIcons();
        hideMenuLoadingScreen();
        return;
    }

    // Group by first letter
    const groups = {};
    filteredProducts.forEach(p => {
        let firstChar = p.name.charAt(0).toUpperCase();
        if (/[0-9]/.test(firstChar)) {
            firstChar = '0-9';
        } else if (!/[A-Z]/.test(firstChar)) {
            firstChar = '#';
        }
        if (!groups[firstChar]) groups[firstChar] = [];
        groups[firstChar].push(p);
    });

    let html = '';
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === '0-9') return -1;
        if (b === '0-9') return 1;
        if (a === '#') return 1;
        if (b === '#') return -1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
        html += `
            <div class="menu-group">
                <div class="menu-group-title">
                    <i data-lucide="bookmark" style="width: 18px;"></i> ${key}
                </div>
            </div>
        `;

        groups[key].forEach(p => {
            const stockVal = parseFloat(p.stock) || 0;
            const isInfinite = stockVal >= 999999;
            const stockText = isInfinite ? '∞ Infinite' : stockVal.toString();
            
            // --- Expiry Check: auto "Not Available" if expired today or past ---
            const parsedExpiry = p.expiry ? new Date(p.expiry) : null;
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            const isExpiredToday = parsedExpiry && parsedExpiry <= todayDate;

            // --- Manual "Not Available Today" flag ---
            const isManuallyUnavailable = p.menuNotAvailableDate === today;

            // Combine: unavailable if expired OR manually marked
            const isNotAvailableToday = isExpiredToday || isManuallyUnavailable;

            // --- Show Stock toggle (admin checkbox) ---
            const showStock = p.menuShowStock === true; // Only show if explicitly enabled by admin

            let stockBadgeClass = 'badge-instock';
            let stockLabel = `In Stock: ${stockText}`;
            if (stockVal <= 0 && !isInfinite) {
                stockBadgeClass = 'badge-outstock';
                stockLabel = 'Out of Stock';
            } else if (stockVal <= 10 && !isInfinite) {
                stockBadgeClass = 'badge-lowstock';
                stockLabel = `Low Stock: ${stockText}`;
            }

            const mrpVal = parseFloat(p.mrp) || 0;
            const saleVal = parseFloat(p.salePrice) || 0;
            const showMrp = mrpVal > saleVal;

            // Check if item is in Digital Order Cart
            const orderItem = menuOrderCart.find(item => item.id === p.id);
            const orderedQty = orderItem ? orderItem.qty : 0;

            // Admin controls row
            const adminControlsHtml = isAdmin ? `
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 6px 0 4px 0; border-top: 1px dashed var(--border-color); margin-top: 6px;">
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; user-select: none;"
                        title="Show stock count on the menu card for customers">
                        <input type="checkbox" ${showStock ? 'checked' : ''} 
                            onchange="toggleMenuShowStock('${p.id}')"
                            style="accent-color: var(--primary-color); width: 14px; height: 14px; cursor: pointer;">
                        Show Stock
                    </label>
                    <button type="button"
                        onclick="toggleMenuNotAvailableToday('${p.id}')"
                        style="padding: 3px 8px; font-size: 0.72rem; border-radius: 6px; border: 1px solid ${isManuallyUnavailable ? '#dc2626' : '#d97706'}; background: ${isManuallyUnavailable ? 'rgba(220,38,38,0.08)' : 'rgba(217,119,6,0.08)'}; color: ${isManuallyUnavailable ? '#dc2626' : '#d97706'}; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="${isManuallyUnavailable ? 'check-circle' : 'x-circle'}" style="width: 12px;"></i>
                        ${isManuallyUnavailable ? 'Mark Available' : 'Not Available Today'}
                    </button>
                    ${isExpiredToday ? `<span style="font-size: 0.7rem; color: #dc2626; font-weight: 600;">⚠ Expired/Expires Today</span>` : ''}
                </div>
            ` : '';

            // Not Available overlay badge
            const notAvailableBadge = isNotAvailableToday ? `
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); border-radius: 14px; display: flex; align-items: center; justify-content: center; z-index: 2; pointer-events: ${isAdmin ? 'none' : 'all'};">
                    <span style="background: #dc2626; color: #fff; font-size: 0.82rem; font-weight: 700; padding: 6px 14px; border-radius: 20px; letter-spacing: 0.5px;">
                        🚫 Not Available Today
                    </span>
                </div>
            ` : '';

            // Product Image HTML if product has image
            const imgVal = p.imageUrl || p.image || '';
            const productImageHtml = imgVal ? `
                <div class="menu-item-img-box" style="width: 100%; height: 140px; border-radius: 10px; overflow: hidden; margin-bottom: 10px; background: var(--bg-color); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; position: relative;">
                    <img src="${imgVal}" alt="${p.name}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                </div>
            ` : '';

            html += `
                <div class="menu-item-card" style="position: relative; ${isNotAvailableToday ? 'opacity: 0.7;' : ''}">
                    ${notAvailableBadge}
                    ${productImageHtml}
                    <div class="menu-card-top">
                        <div>
                            <div class="menu-item-title">${p.name}</div>
                            <div class="menu-badges" style="margin-top: 6px;">
                                <span class="badge-cat">${p.category || 'General'}</span>
                                ${showStock ? `<span class="badge-stock ${stockBadgeClass}">${stockLabel}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="menu-details-meta">
                        ${p.hsn ? `<span class="meta-tag"><i data-lucide="barcode" style="width: 14px;"></i> HSN: ${p.hsn}</span>` : ''}
                        ${p.gst ? `<span class="meta-tag"><i data-lucide="percent" style="width: 14px;"></i> GST: ${p.gst}%</span>` : ''}
                    </div>

                    <div class="menu-card-bottom">
                        <div class="price-wrapper">
                            ${showMrp ? `<span class="price-mrp">${settings.currency}${mrpVal.toFixed(2)}</span>` : ''}
                            <span class="price-sale">${settings.currency}${saleVal.toFixed(2)}</span>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            ${!isNotAvailableToday && (stockVal > 0 || isInfinite) ? (
                                orderedQty > 0 ? `
                                    <div class="menu-qty-ctrl">
                                        <button type="button" class="btn-qty" onclick="updateMenuOrderQuantity('${p.id}', -1)">-</button>
                                        <span class="qty-val">${orderedQty}</span>
                                        <button type="button" class="btn-qty" onclick="updateMenuOrderQuantity('${p.id}', 1)">+</button>
                                    </div>
                                ` : `
                                    <button class="btn btn-secondary" onclick="updateMenuOrderQuantity('${p.id}', 1)" title="Add item to digital order cart" style="padding: 0.45rem 0.8rem; font-size: 0.82rem;">
                                        <i data-lucide="shopping-bag" style="width: 15px;"></i> Order
                                    </button>
                                `
                            ) : (!isNotAvailableToday ? '' : `<span style="font-size: 0.78rem; color: #dc2626; font-weight: 600;">Not Available</span>`)}
                        </div>
                    </div>
                    ${adminControlsHtml}
                </div>
            `;
        });
    });

    container.innerHTML = html;
    lucide.createIcons();
    updateMenuOrderDrawer();
    hideMenuLoadingScreen();
}

function renderCategoryPills(categorySet) {
    const container = document.getElementById('menu-category-pills');
    if (!container) return;

    const categories = Array.from(categorySet).sort();
    
    const catCounts = {};
    products.forEach(p => {
        const cat = p.category || 'General';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    const inStockCount = products.filter(p => (p.stock || 0) > 0 || (p.stock >= 999999)).length;

    let html = `
        <button class="category-pill" onclick="openCustomCakeModal()" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); color: white; border: none; font-weight: 700; box-shadow: 0 4px 10px rgba(236,72,153,0.3);">
            🎂 Customized Cake Order ✨
        </button>
        <button class="category-pill ${activeMenuCategory === 'ALL' ? 'active' : ''}" onclick="setMenuCategoryFilter('ALL')">
            All Items <span class="pill-count">${products.length}</span>
        </button>
        <button class="category-pill ${activeMenuCategory === 'INSTOCK' ? 'active' : ''}" onclick="setMenuCategoryFilter('INSTOCK')">
            <i data-lucide="check-circle-2" style="width: 14px;"></i> In Stock <span class="pill-count">${inStockCount}</span>
        </button>
    `;

    categories.forEach(cat => {
        const isActive = activeMenuCategory === cat;
        const safeCat = cat.replace(/'/g, "\\'");
        html += `
            <button class="category-pill ${isActive ? 'active' : ''}" onclick="setMenuCategoryFilter('${safeCat}')">
                ${cat} <span class="pill-count">${catCounts[cat] || 0}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

function setMenuCategoryFilter(cat) {
    activeMenuCategory = cat;
    const searchInput = document.getElementById('menu-card-search');
    renderMenuCard(searchInput ? searchInput.value : '');
}

function addMenuProductToBill(productId) {
    if (typeof addProductToCart === 'function') {
        addProductToCart(productId, 1);
        showMenuToast('Product added to Billing Terminal!');
    }
}

function showMenuToast(msg) {
    try {
        let toast = document.getElementById('menu-toast');
        if (toast) toast.remove();

        toast = document.createElement('div');
        toast.id = 'menu-toast';
        toast.className = 'menu-toast';
        toast.innerHTML = `<i data-lucide="check-circle" style="color: #10b981; width: 18px;"></i> ${msg}`;
        document.body.appendChild(toast);
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        setTimeout(() => {
            if (toast) toast.remove();
        }, 2500);
    } catch (e) {
        console.error("showMenuToast error:", e);
    }
}

// --- Digital Menu Ordering System ---
let menuOrderCart = [];

function updateMenuOrderQuantity(productId, delta) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    let itemIndex = menuOrderCart.findIndex(i => i.id === productId);
    if (itemIndex > -1) {
        menuOrderCart[itemIndex].qty += delta;
        if (menuOrderCart[itemIndex].qty <= 0) {
            menuOrderCart.splice(itemIndex, 1);
        } else if (menuOrderCart[itemIndex].qty > (product.stock || 0) && (product.stock < 999999)) {
            alert('Exceeds available stock quantity!');
            menuOrderCart[itemIndex].qty -= delta;
            return;
        }
    } else if (delta > 0) {
        if ((product.stock || 0) <= 0 && product.stock < 999999) {
            alert('Item is out of stock!');
            return;
        }
        menuOrderCart.push({
            id: product.id,
            name: product.name,
            salePrice: parseFloat(product.salePrice) || 0,
            mrp: parseFloat(product.mrp) || 0,
            gst: parseFloat(product.gst) || 0,
            batch: product.batch || '',
            stock: product.stock,
            qty: delta
        });
    }

    updateMenuOrderDrawer();
    renderMenuCard();
}

function updateMenuOrderDrawer() {
    const drawer = document.getElementById('menu-order-drawer');
    const badge = document.getElementById('menu-drawer-badge');
    const countEl = document.getElementById('menu-drawer-count');
    const totalEl = document.getElementById('menu-drawer-total');
    if (!drawer) return;

    let totalQty = 0;
    let totalPrice = 0;

    menuOrderCart.forEach(item => {
        totalQty += item.qty;
        totalPrice += (item.salePrice * item.qty);
    });

    if (badge) badge.textContent = totalQty;
    if (countEl) countEl.textContent = `${totalQty} Item${totalQty === 1 ? '' : 's'}`;
    if (totalEl) totalEl.textContent = `${settings.currency}${totalPrice.toFixed(2)}`;

    if (totalQty > 0) {
        drawer.classList.add('active');
    } else {
        drawer.classList.remove('active');
    }
}

function clearMenuOrder() {
    menuOrderCart = [];
    updateMenuOrderDrawer();
    renderMenuCard();
}

function openMenuOrderCheckoutModal() {
    if (menuOrderCart.length === 0) {
        alert('Your digital order cart is empty!');
        return;
    }

    const tbody = document.getElementById('menu-order-items-list');
    const grandTotalEl = document.getElementById('menu-order-grand-total');
    if (!tbody) return;

    let html = '';
    let grandTotal = 0;

    menuOrderCart.forEach(item => {
        const lineTotal = item.salePrice * item.qty;
        grandTotal += lineTotal;

        html += `
            <tr>
                <td style="font-weight: 600;">${item.name}</td>
                <td>${settings.currency}${item.salePrice.toFixed(2)}</td>
                <td>
                    <div class="menu-qty-ctrl">
                        <button type="button" class="btn-qty" onclick="updateMenuOrderQuantity('${item.id}', -1)">-</button>
                        <span class="qty-val">${item.qty}</span>
                        <button type="button" class="btn-qty" onclick="updateMenuOrderQuantity('${item.id}', 1)">+</button>
                    </div>
                </td>
                <td style="text-align: right; font-weight: 700;">${settings.currency}${lineTotal.toFixed(2)}</td>
                <td>
                    <button type="button" class="btn btn-outline" onclick="updateMenuOrderQuantity('${item.id}', -${item.qty})" style="padding: 2px 6px; color: var(--danger-color); border: none;">
                        <i data-lucide="trash" style="width: 15px;"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (grandTotalEl) grandTotalEl.textContent = `${settings.currency}${grandTotal.toFixed(2)}`;

    const loggedUser = sessionStorage.getItem('mediflow_user');
    const nameInput = document.getElementById('morder-name');
    if (nameInput && !nameInput.value) {
        nameInput.value = (loggedUser && loggedUser !== 'VIKI') ? loggedUser : '';
    }

    // Pre-fill Table Info if scanned from Table QR
    const orderTypeSelect = document.getElementById('morder-type');
    const orderRefInput = document.getElementById('morder-ref');
    if (typeof currentCustomerTable !== 'undefined' && currentCustomerTable) {
        if (orderTypeSelect) orderTypeSelect.value = 'Dine-In / Table';
        if (orderRefInput && !orderRefInput.value) orderRefInput.value = currentCustomerTable;
    }

    document.getElementById('menu-order-modal').style.display = 'flex';
    lucide.createIcons();
}

function closeMenuOrderModal() {
    const modal = document.getElementById('menu-order-modal');
    if (modal) modal.style.display = 'none';
}

function sendOrderToBillingTerminal() {
    if (menuOrderCart.length === 0) return;

    menuOrderCart.forEach(orderItem => {
        const existing = cart.find(c => c.id === orderItem.id);
        if (existing) {
            existing.qty += orderItem.qty;
        } else {
            const product = products.find(p => p.id === orderItem.id);
            if (product) {
                cart.push({ ...product, qty: orderItem.qty });
            }
        }
    });

    const nameVal = document.getElementById('morder-name').value.trim();
    const phoneVal = document.getElementById('morder-phone').value.trim();
    if (nameVal && document.getElementById('customer-name')) {
        document.getElementById('customer-name').value = nameVal;
    }
    if (phoneVal && document.getElementById('customer-phone')) {
        document.getElementById('customer-phone').value = phoneVal;
    }

    closeMenuOrderModal();
    clearMenuOrder();
    renderCart();
    switchSection('billing');
    showMenuToast('Order loaded into Billing Terminal!');
}

function handleMenuOrderSubmit(e) {
    e.preventDefault();
    if (isCustomerViewActive && (getTableIdFromURL() || getTableFromURL()) && !validateCustomerTable()) {
        alert('This table QR code is invalid or belongs to another branch. Please scan the correct table QR code.');
        return;
    }
    if (!menuOrderCart || menuOrderCart.length === 0) {
        alert('Cart is empty!');
        return;
    }

    const name = document.getElementById('morder-name').value.trim();
    const phone = document.getElementById('morder-phone').value.trim();
    const orderType = document.getElementById('morder-type').value;
    const typedRef = document.getElementById('morder-ref').value.trim();
    const ref = (isCustomerViewActive && currentCustomerTableValid) ? currentCustomerTable : typedRef;
    const notes = document.getElementById('morder-notes').value.trim();

    let grandTotal = 0;
    menuOrderCart.forEach(i => grandTotal += (i.salePrice * i.qty));

    const orderId = 'ORD-' + Date.now().toString().slice(-6);

    const saleRecord = {
        id: 'S' + Date.now(),
        invoiceNo: orderId,
        date: new Date().toISOString(),
        customer: { name: name, phone: phone },
        items: menuOrderCart.map(i => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            salePrice: i.salePrice,
            gst: i.gst,
            batch: i.batch
        })),
        paymentMode: 'Pending',
        status: 'Pending',
        orderType: orderType,
        orderRef: ref,
        notes: notes,
        subtotal: grandTotal,
        gstTotal: 0,
        discount: 0,
        grandTotal: grandTotal,
        branchId: currentBranchId,
        tableId: currentCustomerTableId || '',
        tableName: currentCustomerTable || '',
        isDigitalOrder: true
    };

    sales.push(saleRecord);
    localStorage.setItem('mediflow_sales', JSON.stringify(sales));
    syncToCloud('sales', { data: sales });

    // Also push to digital_orders list & cloud
    let digitalOrders = JSON.parse(localStorage.getItem('mediflow_digital_orders')) || [];
    digitalOrders.unshift({
        id: orderId,
        date: new Date().toISOString(),
        customerName: name,
        customerPhone: phone,
        orderType: orderType,
        orderRef: ref,
        notes: notes,
        items: saleRecord.items,
        totalAmount: grandTotal,
        status: 'Pending',
        branchId: currentBranchId,
        tableId: currentCustomerTableId || '',
        tableName: currentCustomerTable || '',
        createdAt: new Date().toLocaleString()
    });
    localStorage.setItem('mediflow_digital_orders', JSON.stringify(digitalOrders));
    syncToCloud('digital_orders', digitalOrders);

    // Update Table status to Occupied if Dine-In / Table QR order
    const targetTable = ref || (typeof currentCustomerTable !== 'undefined' ? currentCustomerTable : '');
    if (targetTable) {
        updateTableStatusByRef(targetTable, 'Occupied');
    }

    // Deduct stock
    menuOrderCart.forEach(orderItem => {
        const prodIndex = products.findIndex(p => p.id === orderItem.id);
        if (prodIndex > -1 && products[prodIndex].stock < 999999) {
            products[prodIndex].stock = Math.max(0, products[prodIndex].stock - orderItem.qty);
        }
    });
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    syncToCloud('products', { data: products });

    closeMenuOrderModal();

    if (document.getElementById('success-order-id')) document.getElementById('success-order-id').textContent = `#${orderId}`;
    if (document.getElementById('success-order-customer')) document.getElementById('success-order-customer').textContent = `${name} (${phone})`;
    if (document.getElementById('success-order-items')) document.getElementById('success-order-items').textContent = `${menuOrderCart.length} item(s) - ${orderType} ${ref ? '(' + ref + ')' : ''}`;
    if (document.getElementById('success-order-total')) document.getElementById('success-order-total').textContent = `${settings.currency}${grandTotal.toFixed(2)}`;

    const waMsg = encodeURIComponent(`*T7 BillPro Digital Order Confirmation*\nOrder ID: #${orderId}\nCustomer: ${name}\nOrder Type: ${orderType} ${ref ? '(' + ref + ')' : ''}\nTotal: ${settings.currency}${grandTotal.toFixed(2)}\n\nThank you for your order!`);
    const waBtn = document.getElementById('success-whatsapp-btn');
    if (waBtn) waBtn.href = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${waMsg}`;

    const successModal = document.getElementById('menu-order-success-modal');
    if (successModal) successModal.style.display = 'flex';
    lucide.createIcons();

    clearMenuOrder();
}


// Compatibility handlers for the legacy customer checkout modal.
// The current digital-menu engine uses #menu-order-modal; these handlers keep
// the older #menu-checkout-modal markup functional instead of throwing errors.
function closeMenuOrderCheckoutModal() {
    const modal = document.getElementById('menu-checkout-modal');
    if (modal) modal.style.display = 'none';
}

function closeMenuOrderSuccessModal() {
    const modal = document.getElementById('menu-order-success-modal');
    if (modal) modal.style.display = 'none';
}

function submitCustomerDigitalOrder(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    if (!Array.isArray(menuOrderCart) || menuOrderCart.length === 0) {
        alert('Your digital order cart is empty!');
        return;
    }

    // Reuse the tested order engine by copying legacy checkout values
    // into the current order form fields.
    const copy = (fromId, toId) => {
        const from = document.getElementById(fromId);
        const to = document.getElementById(toId);
        if (from && to) to.value = from.value || '';
    };

    copy('cust-order-name', 'morder-name');
    copy('cust-order-phone', 'morder-phone');
    copy('cust-order-type', 'morder-type');
    copy('cust-order-notes', 'morder-notes');

    const currentRef = document.getElementById('morder-ref');
    const notes = document.getElementById('cust-order-notes');
    if (currentRef && !currentRef.value && notes && /^table\s*[-#]?\s*\S+/i.test(notes.value.trim())) {
        currentRef.value = notes.value.trim();
    }

    const currentForm = document.getElementById('menu-order-form');
    if (currentForm) {
        const eventProxy = {
            preventDefault() {},
        };
        handleMenuOrderSubmit(eventProxy);
    } else {
        alert('Digital order form is unavailable. Please refresh the page and try again.');
        return;
    }

    closeMenuOrderCheckoutModal();
}

// --- Customized Cake Module ---
function openCustomCakeModal() {
    const modal = document.getElementById('custom-cake-modal');
    if (!modal) return;
    const form = document.getElementById('custom-cake-form');
    if (form) form.reset();
    clearCakePhotoPreview();

    const custNameEl = document.getElementById('customer-name');
    const custPhoneEl = document.getElementById('customer-phone');
    if (custNameEl && custNameEl.value) document.getElementById('cake-cust-name').value = custNameEl.value;
    if (custPhoneEl && custPhoneEl.value) document.getElementById('cake-cust-phone').value = custPhoneEl.value;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    const dateStr = tomorrow.toISOString().slice(0, 16);
    const dateInput = document.getElementById('cake-function-date');
    if (dateInput) dateInput.value = dateStr;
    if (document.getElementById('cake-weight')) document.getElementById('cake-weight').value = '1.0 Kg';

    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCustomCakeModal() {
    const modal = document.getElementById('custom-cake-modal');
    if (modal) modal.style.display = 'none';
}

function handleCakePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file (JPG, PNG, WEBP).');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 350;

            if (width > height) {
                if (width > maxDim) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);

            const urlInput = document.getElementById('cake-photo-url');
            const preview = document.getElementById('cake-photo-preview');
            const icon = document.getElementById('cake-photo-placeholder-icon');
            const clearBtn = document.getElementById('cake-photo-clear-btn');

            if (urlInput) urlInput.value = compressedBase64;
            if (preview) {
                preview.src = compressedBase64;
                preview.style.display = 'block';
            }
            if (icon) icon.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'inline-block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearCakePhotoPreview() {
    const fileInput = document.getElementById('cake-photo-file');
    const urlInput = document.getElementById('cake-photo-url');
    const preview = document.getElementById('cake-photo-preview');
    const icon = document.getElementById('cake-photo-placeholder-icon');
    const clearBtn = document.getElementById('cake-photo-clear-btn');

    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    if (icon) icon.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'none';
}

function handleCustomCakeSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('cake-cust-name').value.trim();
    const phone = document.getElementById('cake-cust-phone').value.trim();
    const functionDate = document.getElementById('cake-function-date').value;
    const flavor = document.getElementById('cake-flavor').value;
    const weight = document.getElementById('cake-weight').value;
    const message = document.getElementById('cake-message').value.trim();
    const notes = document.getElementById('cake-notes').value.trim();
    const photoUrl = document.getElementById('cake-photo-url') ? document.getElementById('cake-photo-url').value : '';

    if (!name || !phone || !functionDate || !message) {
        alert('Please fill in all required fields (Name, Phone, Function Date, Cake Message).');
        return;
    }

    const orderId = 'ORD-CAKE-' + Math.floor(1000 + Math.random() * 9000);
    const formattedDate = new Date(functionDate).toLocaleString();

    const saleRecord = {
        id: 'S' + Date.now(),
        invoiceNo: orderId,
        date: new Date().toISOString(),
        customer: { name: name, phone: phone },
        items: [{
            id: 'CUSTOM_CAKE_' + Date.now(),
            name: `🎂 Custom Cake (${flavor}, ${weight})`,
            qty: 1,
            salePrice: 0,
            category: 'Customized Cakes',
            cakeMessage: message,
            functionDate: formattedDate,
            notes: notes,
            imageUrl: photoUrl
        }],
        paymentMode: 'Pending',
        status: 'Pending',
        orderType: '🎂 Custom Cake',
        orderRef: `Function: ${formattedDate}`,
        notes: `🎂 MESSAGE: "${message}" | FUNCTION DATE: ${formattedDate} ${notes ? '| NOTES: ' + notes : ''}`,
        subtotal: 0,
        gstTotal: 0,
        discount: 0,
        grandTotal: 0,
        branchId: currentBranchId,
        isDigitalOrder: true,
        isCustomCake: true
    };

    sales.push(saleRecord);
    localStorage.setItem('mediflow_sales', JSON.stringify(sales));
    syncToCloud('sales', { data: sales });

    let digitalOrders = JSON.parse(localStorage.getItem('mediflow_digital_orders')) || [];
    digitalOrders.unshift({
        id: orderId,
        date: saleRecord.date,
        customerName: name,
        customerPhone: phone,
        orderType: '🎂 Custom Cake',
        orderRef: `Function: ${formattedDate}`,
        items: saleRecord.items,
        notes: saleRecord.notes,
        total: 0,
        status: 'Pending',
        branchId: currentBranchId,
        isCustomCake: true
    });
    localStorage.setItem('mediflow_digital_orders', JSON.stringify(digitalOrders));
    syncToCloud('digital_orders', digitalOrders);

    closeCustomCakeModal();

    if (typeof showMenuToast === 'function') {
        showMenuToast(`🎉 Thank you ${name}! Custom Cake Order #${orderId} placed for ${formattedDate}!`);
    }

    const waMsg = encodeURIComponent(`*T7 BillPro Custom Cake Order Confirmation*\nOrder ID: #${orderId}\nCustomer: ${name}\nFunction Date: ${formattedDate}\nFlavor/Size: ${flavor} (${weight})\nMessage on Cake: "${message}"\nNotes: ${notes || 'None'}\n\nThank you for ordering with us!`);
    const waBtn = document.getElementById('success-whatsapp-btn');
    if (waBtn) waBtn.href = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${waMsg}`;

    if (document.getElementById('success-order-id')) document.getElementById('success-order-id').textContent = `#${orderId}`;
    if (document.getElementById('success-order-customer')) document.getElementById('success-order-customer').textContent = `${name} (${phone})`;
    if (document.getElementById('success-order-items')) document.getElementById('success-order-items').textContent = `🎂 Custom Cake (${flavor}, ${weight}) - "${message}"`;
    if (document.getElementById('success-order-total')) document.getElementById('success-order-total').textContent = `Pending Quote`;

    const successModal = document.getElementById('menu-order-success-modal');
    if (successModal) successModal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    if (typeof renderDigitalOrders === 'function') renderDigitalOrders();
}
window.openCustomCakeModal = openCustomCakeModal;
window.closeCustomCakeModal = closeCustomCakeModal;
window.handleCustomCakeSubmit = handleCustomCakeSubmit;
window.handleCakePhotoUpload = handleCakePhotoUpload;
window.clearCakePhotoPreview = clearCakePhotoPreview;

// --- Digital Menu Orders Module ---
let loadedDigitalOrderId = null;

function getPendingOrdersKey() {
    const branch = (typeof currentBranchId !== 'undefined' && currentBranchId) ? currentBranchId : (sessionStorage.getItem('mediflow_current_branch') || 'branch_default');
    return `mediflow_${branch}_digital_orders`;
}

function renderDigitalOrders() {
    const tbody = document.getElementById('digital-orders-table-body');
    const searchInput = document.getElementById('digital-orders-search');
    const statusFilter = document.getElementById('digital-orders-status-filter');
    if (!tbody) return;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const statusVal = statusFilter ? statusFilter.value : 'ALL';

    let digitalOrders = [];
    try {
        digitalOrders = JSON.parse(localStorage.getItem(getPendingOrdersKey())) || [];
    } catch (e) {
        console.error("Error reading pending orders:", e);
    }

    if (statusVal !== 'ALL') {
        digitalOrders = digitalOrders.filter(s => {
            const currentStatus = s.status || (s.paymentMode === 'Pending' ? 'Pending' : 'Billed');
            return currentStatus.toLowerCase() === statusVal.toLowerCase();
        });
    }

    if (query !== '') {
        digitalOrders = digitalOrders.filter(s => {
            const custName = (s.customer && s.customer.name) ? s.customer.name.toLowerCase() : '';
            const custPhone = (s.customer && s.customer.phone) ? s.customer.phone.toLowerCase() : '';
            const inv = (s.invoiceNo || '').toLowerCase();
            const type = (s.orderType || '').toLowerCase();
            const ref = (s.orderRef || '').toLowerCase();
            const nts = (s.notes || '').toLowerCase();
            return custName.includes(query) || custPhone.includes(query) || inv.includes(query) || type.includes(query) || ref.includes(query) || nts.includes(query);
        });
    }

    digitalOrders.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (digitalOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i data-lucide="clipboard-x" style="width: 40px; height: 40px; margin-bottom: 8px; color: var(--text-muted);"></i>
                    <div>No digital menu orders found.</div>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    let html = '';
    digitalOrders.forEach(o => {
        const orderDate = new Date(o.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const custName = (o.customer && o.customer.name) ? o.customer.name : 'Walk-in';
        const custPhone = (o.customer && o.customer.phone) ? o.customer.phone : '-';
        const orderTypeStr = `${o.orderType || 'Order'}${o.orderRef ? ' (' + o.orderRef + ')' : ''}`;
        const itemsSummary = o.items ? o.items.map(i => `${i.name} x${i.qty}`).join(', ') : '-';
        
        const isCake = o.isCustomCake || (o.orderType && o.orderType.includes('Cake'));
        const typeBadge = isCake 
            ? `<span class="badge" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); color: white; font-weight: 700; padding: 4px 8px; font-size: 0.78rem;">🎂 ${o.orderType || 'Custom Cake'}</span>`
            : `<span class="badge-cat">${orderTypeStr}</span>`;

        let detailsHtml = `<div style="max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsSummary}">${itemsSummary}</div>`;
        if (isCake && o.notes) {
            const cakeImg = (o.items && o.items[0] && o.items[0].imageUrl) ? o.items[0].imageUrl : '';
            detailsHtml = `
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${cakeImg ? `<img src="${cakeImg}" style="width: 38px; height: 38px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" title="Reference Cake Design">` : ''}
                    <div>
                        <div style="font-weight: 600; color: var(--primary-color);">${itemsSummary}</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">${o.notes}</div>
                    </div>
                </div>
            `;
        }

        const currentStatus = o.status || (o.paymentMode === 'Pending' ? 'Pending' : 'Billed');
        const isPending = currentStatus === 'Pending';
        const statusBadge = isPending 
            ? `<span class="badge-stock badge-lowstock" style="font-size: 0.8rem; padding: 4px 10px;"><i data-lucide="clock" style="width: 12px; vertical-align: middle;"></i> Pending</span>`
            : `<span class="badge-stock badge-instock" style="font-size: 0.8rem; padding: 4px 10px;"><i data-lucide="check-circle-2" style="width: 12px; vertical-align: middle;"></i> Billed</span>`;

        const waiterNameStr = o.waiterName || (o.customer && o.customer.phone && isNaN(o.customer.phone) ? o.customer.phone : '');
        const subInfoStr = waiterNameStr ? `👨‍🍳 Waiter: ${waiterNameStr}` : custPhone;

        html += `
            <tr>
                <td><strong>#${o.invoiceNo || o.id}</strong></td>
                <td>${orderDate}</td>
                <td>
                    <div style="font-weight: 600;">${custName}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${subInfoStr}</div>
                </td>
                <td>${typeBadge}</td>
                <td>${detailsHtml}</td>
                <td><strong style="color: var(--primary-color);">${settings.currency}${(parseFloat(o.grandTotal) || 0).toFixed(2)}</strong></td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button type="button" class="btn btn-outline" onclick="printDigitalOrderKOT('${o.id}')" title="Print Kitchen / Bakery Order Ticket (KOT)" style="padding: 0.4rem 0.75rem; font-size: 0.82rem; color: #d97706; border-color: #f59e0b; background: #fffbe6;">
                            <i data-lucide="printer" style="width: 15px;"></i> KOT Print
                        </button>
                        <button type="button" class="btn btn-primary" onclick="loadDigitalOrderToBilling('${o.id}')" title="Load order items into Billing Terminal to Bill now" style="padding: 0.4rem 0.75rem; font-size: 0.82rem;">
                            <i data-lucide="calculator" style="width: 15px;"></i> Bill Order
                        </button>
                        <button type="button" class="btn btn-outline" onclick="deleteDigitalOrder('${o.id}')" title="Delete Order" style="padding: 0.4rem 0.6rem; color: var(--danger-color);">
                            <i data-lucide="trash-2" style="width: 15px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    lucide.createIcons();
}

async function loadDigitalOrderToBilling(orderId) {
    let localDigitalOrders = JSON.parse(localStorage.getItem(getPendingOrdersKey())) || [];
    let orderIndex = localDigitalOrders.findIndex(s => s.id === orderId || s.invoiceNo === orderId);
    let order = orderIndex !== -1 ? localDigitalOrders[orderIndex] : null;
    
    if (!order) {
        // Fallback: check legacy non-branch specific key just in case
        let legacyOrders = JSON.parse(localStorage.getItem('mediflow_digital_orders')) || [];
        let legacyIndex = legacyOrders.findIndex(s => s.id === orderId || s.invoiceNo === orderId);
        if (legacyIndex !== -1) order = legacyOrders[legacyIndex];
    }

    if (!order) {
        alert('Order not found in pending orders!');
        return;
    }

    // DO NOT remove from digital orders or update Firebase to Billed yet!
    // Store it in the global state so processSale() knows this checkout is tied to a Waiter Order.
    loadedDigitalOrderId = order.id || order.invoiceNo;

    if (cart.length > 0) {
        if (!confirm('Active billing cart contains items! Replace current cart with this order?')) {
            return;
        }
    }

    cart = [];
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
            // Determine exact price from item price, salePrice, mrp, total, or order grandTotal
            const itemPrice = parseFloat(item.salePrice || item.price || item.mrp || item.total || (order.items.length === 1 ? order.grandTotal : 0)) || 0;
            const itemQty = parseFloat(item.qty) || 1;

            // Search product in master catalog
            const existingProd = (Array.isArray(products) ? products : []).find(prod => prod.id === item.id || (prod.name && prod.name.toLowerCase() === String(item.name || '').toLowerCase()));

            if (existingProd) {
                const finalPrice = existingProd.salePrice || existingProd.price || itemPrice || existingProd.mrp || 0;
                cart.push({
                    ...existingProd,
                    salePrice: finalPrice,
                    price: finalPrice,
                    mrp: existingProd.mrp || finalPrice,
                    qty: itemQty
                });
            } else {
                cart.push({
                    id: item.id || ('P' + Date.now() + Math.floor(Math.random() * 1000)),
                    name: item.name || item.productName || 'Digital Menu Item',
                    salePrice: itemPrice,
                    price: itemPrice,
                    mrp: itemPrice,
                    purchasePrice: Math.round(itemPrice * 0.7 * 100) / 100,
                    gst: parseFloat(item.gst) || 0,
                    batch: item.batch || 'DIGITAL',
                    stock: 999999,
                    unit: item.unit || 'pcs',
                    qty: itemQty
                });
            }
        });
    }

    if (order.customer) {
        const custNameEl = document.getElementById('customer-name');
        const custPhoneEl = document.getElementById('customer-phone');
        if (custNameEl) custNameEl.value = order.customer.name || '';
        if (custPhoneEl) custPhoneEl.value = order.customer.phone || '';
    }

    // Pre-fill Billing Table Select if order was for a Table
    if (order.orderRef || order.tableName || order.tableNumber) {
        const targetTable = order.orderRef || order.tableName || order.tableNumber;
        const billingSelect = document.getElementById('billing-table-select');
        if (billingSelect) {
            const cleanTarget = String(targetTable).trim().toLowerCase();
            const matchingOpt = Array.from(billingSelect.options).find(opt => opt.value.toLowerCase() === cleanTarget || cleanTarget.includes(opt.value.toLowerCase()));
            if (matchingOpt) {
                billingSelect.value = matchingOpt.value;
            }
        }
    }

    // Pre-fill Billing Waiter Select if order has a Waiter Name
    const targetWaiter = order.waiterName || order.waiter || (order.customer && order.customer.phone && isNaN(order.customer.phone) ? order.customer.phone : '');
    if (targetWaiter) {
        const waiterSelect = document.getElementById('billing-waiter-select');
        if (waiterSelect) {
            const cleanWaiter = String(targetWaiter).trim().toLowerCase();
            let matchingOpt = Array.from(waiterSelect.options).find(opt => opt.value.toLowerCase() === cleanWaiter || opt.textContent.toLowerCase().includes(cleanWaiter));
            if (!matchingOpt) {
                matchingOpt = document.createElement('option');
                matchingOpt.value = targetWaiter;
                matchingOpt.textContent = targetWaiter;
                waiterSelect.appendChild(matchingOpt);
            }
            waiterSelect.value = matchingOpt.value;
        }
    }

    // We no longer remove from sales here, wait until successful payment checkout.

    switchSection('billing');
    if (typeof renderCart === 'function') renderCart();
    if (typeof showMenuToast === 'function') showMenuToast(`Order #${order.invoiceNo || order.id} loaded into Billing Terminal!`);
}

async function deleteDigitalOrder(orderId) {
    if (!confirm('Are you sure you want to cancel/delete this digital order? Stock will be restored.')) return;
    
    let order = null;
    let localDigiOrders = JSON.parse(localStorage.getItem(getPendingOrdersKey())) || [];
    const dIndex = localDigiOrders.findIndex(s => s.id === orderId || s.invoiceNo === orderId);
    
    if (dIndex > -1) {
        order = localDigiOrders[dIndex];
    } else {
        // Legacy fallback check
        let legacyOrders = JSON.parse(localStorage.getItem('mediflow_digital_orders')) || [];
        const legacyIndex = legacyOrders.findIndex(s => s.id === orderId || s.invoiceNo === orderId);
        if (legacyIndex > -1) order = legacyOrders[legacyIndex];
    }
    
    if (order) {
        // Restore stock for cancelled order
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const pIndex = products.findIndex(p => p.id === item.id);
                if (pIndex > -1 && products[pIndex].stock < 999999) {
                    products[pIndex].stock += Number(item.qty || 1);
                }
            });
            localStorage.setItem('mediflow_products', JSON.stringify(products));
            syncToCloud('products', products);
        }

        const targetTable = order.orderRef || order.tableName || '';
        if (targetTable) {
            updateTableStatusByRef(targetTable, 'Available');
        }

        // Clean from digital_orders list
        let digitalOrders = JSON.parse(localStorage.getItem(getPendingOrdersKey())) || [];
        digitalOrders = digitalOrders.filter(d => d.id !== orderId && d.invoiceNo !== orderId);
        localStorage.setItem(getPendingOrdersKey(), JSON.stringify(digitalOrders));
        syncToCloud('digital_orders', digitalOrders);

        if (isFirebaseEnabled && db && (order.isWaiterOrder || String(orderId).startsWith('WORD-'))) {
            try {
                await db.collection('waiter_orders').doc(orderId).update({ status: 'Cancelled' });
                await db.collection('waiter_orders').doc(orderId).delete();
            } catch (err) {
                console.error("Firebase delete failed:", err);
                alert("Cloud Sync Error: Could not delete order from cloud database. " + err.message);
                return;
            }
        }

        // Save to cancelled digital orders audit log
        const cancelledRecord = {
            ...order,
            status: 'Cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy: sessionStorage.getItem('mediflow_user') || 'Admin'
        };
        cancelledDigitalOrders.push(cancelledRecord);
        localStorage.setItem('mediflow_cancelled_digital_orders', JSON.stringify(cancelledDigitalOrders));
        if (typeof syncToCloud === 'function') syncToCloud('cancelled_digital_orders', { data: cancelledDigitalOrders });

        if (isSale) {
            sales = sales.filter(s => s.id !== orderId && s.invoiceNo !== orderId);
            localStorage.setItem('mediflow_sales', JSON.stringify(sales));
            syncToCloud('sales', { data: sales });
        }

        renderDigitalOrders();
        if (typeof activeSection !== 'undefined' && activeSection === 'products') renderProducts();
        if (typeof activeSection !== 'undefined' && activeSection === 'sales') renderSalesHistory();
        showMenuToast('Digital order cancelled & stock restored successfully.');
    } else {
        alert('Order not found!');
    }
}

// --- Reports Module ---
function downloadReportPDF() {
    const reportTitle = document.getElementById('report-table-title') ? document.getElementById('report-table-title').textContent : 'Business Report';
    const shopName = (typeof settings !== 'undefined' && settings.shopName) ? settings.shopName : 'T7 BillPro';
    const shopPhone = (typeof settings !== 'undefined' && settings.shopPhone) ? settings.shopPhone : '';
    const shopAddress = (typeof settings !== 'undefined' && settings.shopAddress) ? settings.shopAddress : '';
    const logoUrl = (typeof settings !== 'undefined' && settings.shopLogo) ? settings.shopLogo : '';
    const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);

    const startDate = document.getElementById('report-start') ? document.getElementById('report-start').value : '';
    const endDate = document.getElementById('report-end') ? document.getElementById('report-end').value : '';
    const dateRangeStr = (startDate && endDate) ? `Period: ${startDate} to ${endDate}` : `Generated: ${new Date().toLocaleDateString()}`;
    
    const tableHead = document.getElementById('report-table-head') ? document.getElementById('report-table-head').innerHTML : '';
    const tableBody = document.getElementById('report-table-body') ? document.getElementById('report-table-body').innerHTML : '';
    const tableFoot = document.getElementById('report-table-foot') ? document.getElementById('report-table-foot').innerHTML : '';

    const printWin = window.open('', '_blank', 'width=950,height=800');
    if (!printWin) {
        alert('Please allow popups in your browser to download/print PDF reports.');
        return;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeFn(reportTitle)} - ${escapeFn(shopName)}</title>
            <style>
                @page { size: A4 portrait; margin: 15mm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; line-height: 1.4; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
                .shop-name { font-size: 22px; font-weight: 700; color: #0284c7; margin: 0 0 4px 0; }
                .shop-info { font-size: 12px; color: #64748b; margin: 2px 0; }
                .report-title-box { text-align: right; }
                .report-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0; }
                .report-date { font-size: 12px; color: #0284c7; font-weight: 600; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th { background-color: #f1f5f9; color: #334155; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 2px solid #cbd5e1; }
                td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
                tr:nth-child(even) td { background-color: #f8fafc; }
                tfoot tr td { font-weight: bold; background-color: #f1f5f9; border-top: 2px solid #94a3b8; padding: 10px 8px; }
                .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
                @media print {
                    body { padding: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 20px; text-align: right;">
                <button onclick="window.print();" style="background: #0284c7; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px;">
                    🖨️ Print / Save as PDF
                </button>
            </div>
            <div class="header">
                <div>
                    ${logoUrl ? `<img src="${logoUrl}" style="max-height: 45px; margin-bottom: 6px; display: block;">` : ''}
                    <h1 class="shop-name">${escapeFn(shopName)}</h1>
                    ${shopAddress ? `<div class="shop-info">${escapeFn(shopAddress)}</div>` : ''}
                    ${shopPhone ? `<div class="shop-info">Phone: ${escapeFn(shopPhone)}</div>` : ''}
                </div>
                <div class="report-title-box">
                    <div class="report-title">${escapeFn(reportTitle)}</div>
                    <div class="report-date">${escapeFn(dateRangeStr)}</div>
                </div>
            </div>
            <table>
                <thead>${tableHead}</thead>
                <tbody>${tableBody}</tbody>
                <tfoot>${tableFoot}</tfoot>
            </table>
            <div class="footer">
                Report generated by ${escapeFn(shopName)} POS System &bull; ${new Date().toLocaleString()}
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 400);
                };
            </script>
        </body>
        </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
}

// --- Automated Local Directory Backup (File System Access API) ---
const dbName = 'MediFlowFileSystemDB';
const storeName = 'handles';

function initFileSystemDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(storeName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getBackupDirHandle() {
    try {
        const db = await initFileSystemDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get('backupDirHandle');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error('IndexedDB access error:', e);
        return null;
    }
}

async function saveBackupDirHandle(handle) {
    try {
        const db = await initFileSystemDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(handle, 'backupDirHandle');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error('IndexedDB save error:', e);
    }
}

async function updateBackupDirUI() {
    const handle = await getBackupDirHandle();
    const statusEl = document.getElementById('backup-dir-status');
    if (statusEl) {
        if (handle) {
            statusEl.innerHTML = `<i data-lucide="check-circle" style="color: #16a34a; width: 16px; vertical-align: middle;"></i> <strong>Active:</strong> ${handle.name}`;
            lucide.createIcons();
        } else {
            statusEl.textContent = 'No folder selected.';
        }
    }
}

window.selectBackupDir = async function() {
    try {
        if (!window.showDirectoryPicker) {
            alert('Your browser does not support local folder selection. Please use Google Chrome or Microsoft Edge.');
            return;
        }
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveBackupDirHandle(dirHandle);
        updateBackupDirUI();
        alert('Backup folder selected successfully! The system will now automatically save a backup here during shift summaries.');
    } catch (err) {
        console.error(err);
        // User aborted or error
    }
};

// Initialize UI on load
updateBackupDirUI();

window.runAutoLocalBackup = async function() {
    try {
        const dirHandle = await getBackupDirHandle();
        if (!dirHandle) return; // No directory selected

        // Verify permission, request if needed (can happen after browser restart)
        if (await dirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
            if (await dirHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                console.warn("Permission to backup directory denied.");
                return;
            }
        }

        const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `T7_BillPro_AutoBackup_${dateStr}.json`;
        
        const backupData = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            data: {}
        };
        
        branchSpecificKeys.forEach(k => {
            backupData.data[k] = JSON.parse(localStorage.getItem(k));
        });

        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(backupData, null, 2));
        await writable.close();
        
        console.log(`Auto-backup saved to local folder as ${filename}`);
    } catch (e) {
        console.error("Auto local backup failed:", e);
    }
}

// --- Digital Menu Sharing & QR Code ---
function getBranchIdFromURL() {
    const href = window.location.href;
    const match = href.match(/[?&]branch=([^&#]+)/);
    if (match && match[1]) {
        return decodeURIComponent(match[1]);
    }
    return null;
}

function getDigitalMenuURL(branchId) {
    const targetBranch = branchId || (typeof currentBranchId !== 'undefined' && currentBranchId ? currentBranchId : (sessionStorage.getItem('mediflow_current_branch') || 'branch_default'));
    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    return `${baseUrl}#menu-card?branch=${encodeURIComponent(targetBranch)}`;
}

function shareDigitalMenuWhatsApp(branchId) {
    const targetBranch = branchId || (typeof currentBranchId !== 'undefined' ? currentBranchId : 'branch_default');
    const branchObj = (typeof branches !== 'undefined' && Array.isArray(branches)) ? branches.find(b => b.id === targetBranch) : null;
    const shopName = settings.shopName || (branchObj ? branchObj.name : 'T7 BillPro');
    const menuUrl = getDigitalMenuURL(targetBranch);
    const message = `Hello! Check out our live Digital Catalog & Menu for ${shopName}:\n\n🔗 ${menuUrl}\n\nYou can browse our live stock and place orders directly!`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

function copyDigitalMenuLink(branchId) {
    const targetBranch = branchId || (typeof currentBranchId !== 'undefined' ? currentBranchId : 'branch_default');
    const menuUrl = getDigitalMenuURL(targetBranch);
    const branchObj = (typeof branches !== 'undefined' && Array.isArray(branches)) ? branches.find(b => b.id === targetBranch) : null;
    const label = branchObj ? branchObj.name : 'Digital Menu';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(menuUrl).then(() => {
            alert(`Digital Menu link for "${label}" copied to clipboard!\n\n` + menuUrl);
        }).catch(() => {
            prompt(`Copy Digital Menu Link for "${label}":`, menuUrl);
        });
    } else {
        prompt(`Copy Digital Menu Link for "${label}":`, menuUrl);
    }
}

function copyBranchMenuLink(branchId) {
    copyDigitalMenuLink(branchId);
}

function shareBranchMenuWhatsApp(branchId) {
    shareDigitalMenuWhatsApp(branchId);
}

function openBranchMenuLink(branchId) {
    const menuUrl = getDigitalMenuURL(branchId);
    window.open(menuUrl, '_blank');
}

function showDigitalMenuQRCode(branchId) {
    const modal = document.getElementById('qr-code-modal');
    const qrImg = document.getElementById('qr-code-img');
    const qrUrlText = document.getElementById('qr-code-url');
    const shopTitle = document.getElementById('qr-shop-name');
    
    if (!modal) return;
    
    const targetBranch = branchId || (typeof currentBranchId !== 'undefined' ? currentBranchId : 'branch_default');
    const branchObj = (typeof branches !== 'undefined' && Array.isArray(branches)) ? branches.find(b => b.id === targetBranch) : null;
    const menuUrl = getDigitalMenuURL(targetBranch);
    const qrApiUrl = window.generateOfflineQRCode(menuUrl, 250);
    
    if (qrImg) qrImg.src = qrApiUrl;
    if (qrUrlText) qrUrlText.textContent = menuUrl;
    if (shopTitle) shopTitle.textContent = settings.shopName || (branchObj ? branchObj.name : 'T7 BillPro');
    
    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeQRCodeModal() {
    const modal = document.getElementById('qr-code-modal');
    if (modal) modal.style.display = 'none';
}

function printQRCodePoster() {
    const shopName = settings.shopName || 'T7 BillPro';
    const shopAddress = settings.shopAddress || '';
    const shopPhone = settings.shopPhone || '';
    const menuUrl = getDigitalMenuURL();
    const qrApiUrl = window.generateOfflineQRCode(menuUrl, 300);
    
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('Please allow popups to print the QR Code poster.');
        return;
    }
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${shopName} - Scan QR Code for Digital Menu</title>
            <style>
                body { font-family: 'Inter', system-ui, sans-serif; text-align: center; padding: 40px; color: #1e293b; background: #f8fafc; }
                .poster { border: 4px solid #2563eb; border-radius: 24px; padding: 40px; max-width: 450px; margin: 0 auto; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                h1 { color: #2563eb; font-size: 2rem; margin-bottom: 8px; margin-top: 0; }
                p { color: #64748b; font-size: 1rem; margin-bottom: 24px; }
                img { width: 250px; height: 250px; border-radius: 12px; border: 1px solid #cbd5e1; padding: 10px; background: white; }
                .footer { margin-top: 24px; font-weight: bold; color: #0f172a; font-size: 1.1rem; }
                .link { font-size: 0.85rem; color: #64748b; word-break: break-all; margin-top: 10px; font-family: monospace; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="poster">
                <h1>${shopName}</h1>
                <p>Scan QR Code to View Live Digital Catalog & Menu</p>
                <img src="${qrApiUrl}" alt="QR Code">
                <div class="footer">Scan with your Phone Camera to Browse & Order</div>
                ${shopAddress ? `<div style="font-size: 0.9rem; color: #475569; margin-top: 8px;">${shopAddress} | ${shopPhone}</div>` : ''}
                <div class="link">${menuUrl}</div>
            </div>
        </body>
        </html>
    `);
    printWin.document.close();
}

window.shareDigitalMenuWhatsApp = shareDigitalMenuWhatsApp;
window.copyDigitalMenuLink = copyDigitalMenuLink;
window.showDigitalMenuQRCode = showDigitalMenuQRCode;
window.closeQRCodeModal = closeQRCodeModal;
window.printQRCodePoster = printQRCodePoster;

// Resolve a QR destination that can actually be opened from a customer's phone.
// Local development hosts (localhost/127.0.0.1) are not reachable from another device,
// so QR codes use the production domain defined by the project's CNAME.
function getPublicCakeOrderBaseUrl() {
    return window.location.href.split('#')[0].split('?')[0];
}

// --- Customized Cake Order & QR Code Functions ---
function showCustomCakeQRCode() {
    const modal = document.getElementById('cake-qr-modal');
    const qrImg = document.getElementById('cake-qr-code-img');
    const qrUrlText = document.getElementById('cake-qr-code-url');
    const shopTitle = document.getElementById('cake-qr-shop-name');

    if (!modal) return;

    const targetBranch = (typeof currentBranchId !== 'undefined' && currentBranchId) ? currentBranchId : (sessionStorage.getItem('mediflow_current_branch') || 'branch_default');
    const baseUrl = getPublicCakeOrderBaseUrl();
    const cakeUrl = `${baseUrl}#menu-card?branch=${encodeURIComponent(targetBranch)}&cake=1`;
    const qrApiUrl = window.generateOfflineQRCode(cakeUrl, 280);

    if (qrImg) qrImg.src = qrApiUrl;
    if (qrUrlText) qrUrlText.textContent = cakeUrl;
    if (shopTitle) shopTitle.textContent = (typeof settings !== 'undefined' && settings.shopName) ? settings.shopName : 'T7 BillPro Bakery';

    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCakeQRModal() {
    const modal = document.getElementById('cake-qr-modal');
    if (modal) modal.style.display = 'none';
}

function copyCustomCakeLink() {
    const targetBranch = (typeof currentBranchId !== 'undefined' && currentBranchId) ? currentBranchId : (sessionStorage.getItem('mediflow_current_branch') || 'branch_default');
    const baseUrl = getPublicCakeOrderBaseUrl();
    const cakeUrl = `${baseUrl}#menu-card?branch=${encodeURIComponent(targetBranch)}&cake=1`;
    navigator.clipboard.writeText(cakeUrl).then(() => {
        alert('Customized Cake Order link copied to clipboard!');
    }).catch(() => {
        prompt('Copy Customized Cake Order link:', cakeUrl);
    });
}

function printCakeQRCodePoster() {
    const shopName = (typeof settings !== 'undefined' && settings.shopName) ? settings.shopName : 'T7 BillPro Bakery';
    const shopAddress = (typeof settings !== 'undefined' && settings.shopAddress) ? settings.shopAddress : '';
    const shopPhone = (typeof settings !== 'undefined' && settings.shopPhone) ? settings.shopPhone : '';
    const targetBranch = (typeof currentBranchId !== 'undefined' && currentBranchId) ? currentBranchId : (sessionStorage.getItem('mediflow_current_branch') || 'branch_default');
    const baseUrl = getPublicCakeOrderBaseUrl();
    const cakeUrl = `${baseUrl}#menu-card?branch=${encodeURIComponent(targetBranch)}&cake=1`;
    const qrApiUrl = window.generateOfflineQRCode(cakeUrl, 300);

    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('Please allow popups to print the QR Code poster.');
        return;
    }
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${shopName} - Order Customized Cake QR Code</title>
            <style>
                body { font-family: 'Segoe UI', Inter, sans-serif; text-align: center; padding: 40px; color: #831843; background: #fff0f5; }
                .poster { border: 4px dashed #ec4899; border-radius: 24px; padding: 40px; max-width: 480px; margin: 0 auto; background: white; box-shadow: 0 15px 35px rgba(236,72,153,0.2); }
                h1 { color: #be185d; font-size: 2.2rem; margin-bottom: 6px; margin-top: 0; font-weight: 800; }
                .subtitle { color: #db2777; font-size: 1.2rem; font-weight: 700; margin-bottom: 24px; }
                p { color: #9d174d; font-size: 1rem; margin-bottom: 24px; }
                img { width: 260px; height: 260px; border-radius: 16px; border: 2px solid #fbcfe8; padding: 12px; background: #fff0f5; }
                .footer { margin-top: 24px; font-weight: bold; color: #be185d; font-size: 1.1rem; }
            </style>
        </head>
        <body>
            <div class="poster">
                <h1>🎂 ${shopName}</h1>
                <div class="subtitle">Order Customized Cake Online</div>
                <p>Scan this QR code with your mobile camera to customize your cake flavor, weight, shape, eggless option & delivery date!</p>
                <img src="${qrApiUrl}" alt="Custom Cake QR Code">
                <div class="footer">
                    ${shopAddress ? `<div>${shopAddress}</div>` : ''}
                    ${shopPhone ? `<div>Call / WhatsApp: ${shopPhone}</div>` : ''}
                </div>
            </div>
            <script>
                window.onload = function() { setTimeout(function() { window.print(); }, 400); };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

function calculateCustomCakePrice() {
    const flavorSelect = document.getElementById('cake-flavor');
    const weightSelect = document.getElementById('cake-weight');
    const shapeSelect = document.getElementById('cake-shape');
    const egglessSelect = document.getElementById('cake-eggless');
    const priceDisplay = document.getElementById('cake-calculated-price');
    const priceInput = document.getElementById('cake-total-price');

    if (!flavorSelect || !weightSelect) return 650;

    const selectedFlavorName = flavorSelect.value;
    const selectedWeightStr = weightSelect.value;
    const selectedShapeStr = shapeSelect ? shapeSelect.value : 'Round';
    const selectedEgglessStr = egglessSelect ? egglessSelect.value : 'Eggless';

    // 1. Base price per Kg from cakeFlavors array or default 600
    const flavorObj = (Array.isArray(cakeFlavors) ? cakeFlavors : []).find(f => f.name === selectedFlavorName);
    const basePricePerKg = (flavorObj && parseFloat(flavorObj.price)) ? parseFloat(flavorObj.price) : 600;

    // 2. Weight multiplier
    let weightMult = 1.0;
    if (selectedWeightStr.includes('0.5')) weightMult = 0.5;
    else if (selectedWeightStr.includes('1.5')) weightMult = 1.5;
    else if (selectedWeightStr.includes('2')) weightMult = 2.0;
    else if (selectedWeightStr.includes('3')) weightMult = 3.0;
    else if (selectedWeightStr.includes('5')) weightMult = 5.0;
    else if (selectedWeightStr.includes('1')) weightMult = 1.0;

    let baseAmount = basePricePerKg * weightMult;

    // 3. Shape addon
    let shapeAddon = 0;
    if (selectedShapeStr.includes('Heart')) shapeAddon = 100;
    else if (selectedShapeStr.includes('Square')) shapeAddon = 50;
    else if (selectedShapeStr.includes('2-Tier')) shapeAddon = 300;
    else if (selectedShapeStr.includes('Theme') || selectedShapeStr.includes('Character')) shapeAddon = 250;

    // 4. Eggless addon
    let egglessAddon = 0;
    if (selectedEgglessStr === 'Eggless' || selectedEgglessStr.includes('Eggless')) egglessAddon = 50;

    const grandTotal = Math.round(baseAmount + shapeAddon + egglessAddon);
    const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';

    if (priceDisplay) {
        priceDisplay.textContent = `${curr}${grandTotal.toFixed(2)}`;
    }
    if (priceInput) {
        priceInput.value = grandTotal;
    }

    return grandTotal;
}

window.openCustomCakeModal = openCustomCakeModal;
window.closeCustomCakeModal = closeCustomCakeModal;
window.showCustomCakeQRCode = showCustomCakeQRCode;
window.closeCakeQRModal = closeCakeQRModal;
window.copyCustomCakeLink = copyCustomCakeLink;
window.printCakeQRCodePoster = printCakeQRCodePoster;
window.handleCustomCakeSubmit = handleCustomCakeSubmit;
window.calculateCustomCakePrice = calculateCustomCakePrice;
window.printDigitalOrderKOT = printDigitalOrderKOT;

function printDigitalOrderKOT(orderId) {
    let pendingOrders = [];
    try {
        pendingOrders = JSON.parse(localStorage.getItem(getPendingOrdersKey())) || [];
    } catch (e) {}
    if (pendingOrders.length === 0) {
        try {
            pendingOrders = JSON.parse(localStorage.getItem('mediflow_digital_orders')) || [];
        } catch (e) {}
    }
    
    const order = sales.find(s => s.id === orderId || s.invoiceNo === orderId) || 
                  pendingOrders.find(s => s.id === orderId || s.invoiceNo === orderId);
    if (!order) {
        alert('Order not found!');
        return;
    }

    const shopName = (typeof settings !== 'undefined' && settings.shopName) ? settings.shopName : 'T7 BillPro Bakery';
    const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);

    const orderNo = order.invoiceNo || order.id;
    const orderDate = new Date(order.date || Date.now()).toLocaleString();
    const custName = (order.customer && order.customer.name) ? order.customer.name : 'Walk-in Customer';
    const custPhone = (order.customer && order.customer.phone) ? order.customer.phone : '-';
    const orderTypeStr = order.orderType || 'Digital Order';
    const notesStr = order.notes || '';
    const deliveryTime = (order.deliveryDate || order.deliveryTime || '').replace(/Immediate\s*\/\s*Store\s*Pickup/i, '').trim();

    let itemsHtml = '';
    if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item, idx) => {
            itemsHtml += `
                <tr>
                    <td style="padding: 6px 4px; border-bottom: 1px dashed #cbd5e1; font-weight: bold; font-size: 14px;">${idx + 1}. ${escapeFn(item.name || item.productName)}</td>
                    <td style="padding: 6px 4px; border-bottom: 1px dashed #cbd5e1; font-weight: bold; font-size: 16px; text-align: center;">x${item.qty || 1}</td>
                </tr>
            `;
            if (item.note) {
                itemsHtml += `
                    <tr>
                        <td colspan="2" style="padding: 2px 4px 6px 12px; font-size: 12px; color: #475569; font-style: italic; border-bottom: 1px dashed #cbd5e1;">📌 ${escapeFn(item.note)}</td>
                    </tr>
                `;
            }
        });
    }

    const printWin = window.open('', '_blank', 'width=450,height=600');
    if (!printWin) {
        alert('Please allow popups in your browser to print KOT.');
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>KOT #${orderNo} - ${shopName}</title>
            <style>
                @page { margin: 4mm; }
                body { font-family: 'Courier New', Courier, monospace, sans-serif; width: 280px; margin: 0 auto; padding: 10px; color: #000; font-size: 13px; line-height: 1.3; }
                .kot-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
                .kot-title { font-size: 18px; font-weight: 900; text-transform: uppercase; margin: 0; }
                .shop-title { font-size: 14px; font-weight: bold; margin-top: 2px; }
                .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                .notes-box { margin-top: 10px; padding: 8px; border: 1.5px solid #000; border-radius: 4px; font-size: 12px; background: #fff; }
                .footer { margin-top: 12px; text-align: center; border-top: 2px solid #000; padding-top: 6px; font-weight: bold; font-size: 12px; }
                @media print {
                    body { width: 100%; padding: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 10px; text-align: center;">
                <button onclick="window.print();" style="background: #d97706; color: white; border: none; padding: 8px 16px; font-weight: bold; border-radius: 4px; cursor: pointer;">🖨️ Print KOT Ticket</button>
            </div>
            <div class="kot-header">
                <div class="kot-title">*** K O T ***</div>
                <div class="shop-title">${escapeFn(shopName)}</div>
                <div style="font-size: 11px; margin-top: 2px;">Kitchen / Bakery Order Ticket</div>
            </div>
            <div class="info-row">
                <span><strong>Order #:</strong> ${escapeFn(orderNo)}</span>
                <span><strong>Type:</strong> ${escapeFn(orderTypeStr)}</span>
            </div>
            <div class="info-row">
                <span><strong>Date:</strong> ${escapeFn(orderDate)}</span>
            </div>
            <div class="info-row" style="border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
                <span><strong>Customer:</strong> ${escapeFn(custName)} (${escapeFn(custPhone)})</span>
            </div>
            ${deliveryTime ? `<div style="font-weight: bold; color: #000; margin-bottom: 6px; font-size: 13px;">⏰ Pickup / Delivery: ${escapeFn(deliveryTime)}</div>` : ''}
            <table>
                <thead>
                    <tr style="border-bottom: 1.5px solid #000;">
                        <th style="text-align: left; padding: 4px 0;">Item / Customization</th>
                        <th style="text-align: center; padding: 4px 0; width: 45px;">Qty</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            ${notesStr ? `<div class="notes-box"><strong>📋 Special Notes / Customization:</strong><br>${escapeFn(notesStr)}</div>` : ''}
            <div class="footer">
                *** PREPARE IMMEDIATELY ***
            </div>
            <script>
                window.onload = function() { setTimeout(function() { window.print(); }, 400); };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// --- Cake Flavors / Types Management ---
function renderCakeFlavorsManagement() {
    const list = document.getElementById('cake-flavor-list');
    if (!list) return;
    const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);
    const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';

    list.innerHTML = cakeFlavors.map(f => {
        const p = parseFloat(f.price) || 600;
        return `
        <div style="background: ${f.enabled ? 'var(--primary-light, #e0f2fe)' : '#f1f5f9'}; border: 1px solid ${f.enabled ? '#0284c7' : '#cbd5e1'}; padding: 8px 14px; border-radius: 20px; display: flex; align-items: center; gap: 10px; font-size: 0.88rem;">
            <label class="toggle-switch" style="transform: scale(0.75); margin: 0;" title="${f.enabled ? 'Enabled in Cake Order' : 'Disabled in Cake Order'}">
                <input type="checkbox" ${f.enabled ? 'checked' : ''} onchange="toggleCakeFlavorStatus('${f.id}')">
                <span class="toggle-slider"></span>
            </label>
            <strong style="color: ${f.enabled ? '#0369a1' : '#64748b'}; text-decoration: ${f.enabled ? 'none' : 'line-through'};">${escapeFn(f.name)}</strong>
            <span style="font-size: 0.78rem; font-weight: 700; color: #0284c7; background: #ffffff; padding: 2px 8px; border-radius: 10px; cursor: pointer;" title="Click to edit price per Kg" onclick="editCakeFlavorPrice('${f.id}')">${curr}${p}/kg</span>
            <i data-lucide="edit-2" style="width: 13px; cursor: pointer; color: var(--primary-color);" title="Edit Name" onclick="editCakeFlavorName('${f.id}')"></i>
            <i data-lucide="trash-2" style="width: 13px; cursor: pointer; color: var(--danger-color);" title="Delete Flavor" onclick="deleteCakeFlavor('${f.id}')"></i>
        </div>
    `}).join('');

    updateCakeFlavorDropdowns();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}

function updateCakeFlavorDropdowns() {
    const cakeFlavorSelect = document.getElementById('cake-flavor');
    if (cakeFlavorSelect) {
        const currentVal = cakeFlavorSelect.value;
        const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (str => str);
        const curr = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '₹';

        // Show ONLY enabled cake flavors with price label!
        const activeFlavors = cakeFlavors.filter(f => f.enabled !== false);

        let html = activeFlavors.map(f => {
            const p = parseFloat(f.price) || 600;
            return `<option value="${escapeFn(f.name)}" data-price="${p}">${escapeFn(f.name)} (${curr}${p}/Kg)</option>`;
        }).join('');
        if (activeFlavors.length === 0) {
            html = '<option value="Custom / Other" data-price="600">Custom / Other (₹600/Kg)</option>';
        }
        cakeFlavorSelect.innerHTML = html;
        if (activeFlavors.some(f => f.name === currentVal)) cakeFlavorSelect.value = currentVal;
    }
    calculateCustomCakePrice();
}

function addCakeFlavor() {
    const input = document.getElementById('new-cake-flavor-name');
    const priceInput = document.getElementById('new-cake-flavor-price');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    const price = parseFloat(priceInput ? priceInput.value : 0) || 600;

    if (cakeFlavors.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        alert('Cake flavor already exists!');
        return;
    }

    cakeFlavors.push({
        id: 'cf_' + Date.now(),
        name: name,
        price: price,
        enabled: true
    });
    saveCakeFlavors();
    input.value = '';
    if (priceInput) priceInput.value = '';
    renderCakeFlavorsManagement();
    alert(`Cake flavor "${name}" (${price}/kg) added and enabled!`);
}

function editCakeFlavorPrice(id) {
    const flavor = cakeFlavors.find(f => f.id === id);
    if (!flavor) return;
    const newPriceStr = prompt(`Enter price per Kg for "${flavor.name}":`, flavor.price || 600);
    if (newPriceStr === null) return;

    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice) || newPrice <= 0) {
        alert('Please enter a valid positive price!');
        return;
    }

    flavor.price = newPrice;
    saveCakeFlavors();
    renderCakeFlavorsManagement();
}

function toggleCakeFlavorStatus(id) {
    const flavor = cakeFlavors.find(f => f.id === id);
    if (flavor) {
        flavor.enabled = !flavor.enabled;
        saveCakeFlavors();
        renderCakeFlavorsManagement();
    }
}

function editCakeFlavorName(id) {
    const flavor = cakeFlavors.find(f => f.id === id);
    if (!flavor) return;
    const newName = prompt('Enter new name for Cake Flavor:', flavor.name);
    if (!newName || newName.trim() === flavor.name) return;
    
    const trimmed = newName.trim();
    if (cakeFlavors.some(f => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase())) {
        alert('Flavor name already exists!');
        return;
    }
    
    flavor.name = trimmed;
    saveCakeFlavors();
    renderCakeFlavorsManagement();
}

function deleteCakeFlavor(id) {
    const flavor = cakeFlavors.find(f => f.id === id);
    if (!flavor) return;
    if (!confirm(`Are you sure you want to delete cake flavor "${flavor.name}"?`)) return;
    
    cakeFlavors = cakeFlavors.filter(f => f.id !== id);
    saveCakeFlavors();
    renderCakeFlavorsManagement();
}

function saveCakeFlavors() {
    localStorage.setItem('mediflow_cake_flavors', JSON.stringify(cakeFlavors));
    if (typeof syncToCloud === 'function') {
        syncToCloud('cakeFlavors', { data: cakeFlavors });
    }
}

window.renderCakeFlavorsManagement = renderCakeFlavorsManagement;
window.updateCakeFlavorDropdowns = updateCakeFlavorDropdowns;
window.addCakeFlavor = addCakeFlavor;
window.toggleCakeFlavorStatus = toggleCakeFlavorStatus;
window.editCakeFlavorName = editCakeFlavorName;
window.deleteCakeFlavor = deleteCakeFlavor;

// --- Staff Management & Payroll Module ---
let activeStaffTab = 'profiles';
let tempDailyAttendance = {};

function switchStaffSubTab(tabName) {
    activeStaffTab = tabName;
    document.querySelectorAll('.staff-subtab-btn').forEach(btn => {
        if (btn.dataset.staffTab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    document.querySelectorAll('.staff-subtab-content').forEach(content => {
        content.style.display = 'none';
    });

    const target = document.getElementById(`staff-subtab-${tabName}`);
    if (target) target.style.display = 'block';

    if (tabName === 'profiles') renderStaffProfiles();
    else if (tabName === 'attendance') renderManualAttendance();
    else if (tabName === 'advances') renderStaffAdvances();
    else if (tabName === 'payroll') renderPayroll();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderStaffManagement() {
    switchStaffSubTab(activeStaffTab || 'profiles');
}

function renderStaffProfiles() {
    const tableBody = document.getElementById('staff-table-body');
    if (!tableBody) return;

    const searchTerm = (document.getElementById('staff-search-input')?.value || '').toLowerCase();
    const filtered = staffList.filter(s => 
        (s.name || '').toLowerCase().includes(searchTerm) || 
        (s.phone && s.phone.includes(searchTerm)) ||
        (s.role && s.role.toLowerCase().includes(searchTerm))
    );

    // Compute Stats
    const totalStaff = staffList.length;
    const activeStaff = staffList.filter(s => s.status === 'Active').length;
    
    let totalPendingAdvances = 0;
    staffList.forEach(s => {
        totalPendingAdvances += getStaffOutstandingAdvance(s.id);
    });

    let totalMonthlyBase = staffList.reduce((acc, s) => {
        if (s.status === 'Active') {
            return acc + (s.salaryType === 'Monthly' ? Number(s.salaryRate || 0) : Number(s.salaryRate || 0) * 26);
        }
        return acc;
    }, 0);

    if (document.getElementById('staff-stat-total')) document.getElementById('staff-stat-total').textContent = totalStaff;
    if (document.getElementById('staff-stat-active')) document.getElementById('staff-stat-active').textContent = activeStaff;
    if (document.getElementById('staff-stat-advances')) document.getElementById('staff-stat-advances').textContent = `₹${totalPendingAdvances.toFixed(2)}`;
    if (document.getElementById('staff-stat-payroll')) document.getElementById('staff-stat-payroll').textContent = `₹${totalMonthlyBase.toFixed(2)}`;

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No staff members found</td></tr>`;
        return;
    }

    filtered.forEach(s => {
        const advBal = getStaffOutstandingAdvance(s.id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${s.id}</strong></td>
            <td><strong>${escapeHtml(s.name)}</strong></td>
            <td>${escapeHtml(s.role || '-')}</td>
            <td>${escapeHtml(s.phone || '-')}</td>
            <td><span class="badge-status" style="background:#e0f2fe; color:#0369a1;">${s.salaryType || 'Monthly'}</span></td>
            <td>₹${Number(s.salaryRate || 0).toFixed(2)}${s.salaryType === 'Daily' ? ' / day' : ' / mo'}</td>
            <td style="font-weight:600; color:${advBal > 0 ? '#dc2626' : 'var(--text-main)'};">₹${advBal.toFixed(2)}</td>
            <td><span class="badge-status ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status || 'Active'}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="openStaffModal('${s.id}')" title="Edit Staff">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem; color:#dc2626;" onclick="deleteStaff('${s.id}')" title="Delete Staff">
                        <i data-lucide="trash-2"></i>
                    </button>
                    <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="openAdvanceModal('${s.id}', 'given')" title="Give Advance">
                        <i data-lucide="plus-circle"></i> Adv
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function getStaffOutstandingAdvance(staffId) {
    let totalGiven = 0;
    let totalReturnedOrDeducted = 0;
    staffAdvances.filter(a => a.staffId === staffId).forEach(a => {
        if (a.type === 'given') totalGiven += Number(a.amount || 0);
        else totalReturnedOrDeducted += Number(a.amount || 0);
    });
    return Math.max(0, totalGiven - totalReturnedOrDeducted);
}

function openStaffModal(staffId = null) {
    const modal = document.getElementById('staff-modal');
    if (!modal) return;
    document.getElementById('staff-form').reset();
    document.getElementById('edit-staff-id').value = '';

    if (staffId) {
        const staff = staffList.find(s => s.id === staffId);
        if (staff) {
            document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
            document.getElementById('edit-staff-id').value = staff.id;
            document.getElementById('staff-name').value = staff.name;
            document.getElementById('staff-phone').value = staff.phone || '';
            document.getElementById('staff-role').value = staff.role || 'Cashier';
            document.getElementById('staff-salary-type').value = staff.salaryType || 'Monthly';
            document.getElementById('staff-salary-rate').value = staff.salaryRate || 0;
            document.getElementById('staff-joining-date').value = staff.joiningDate || '';
            document.getElementById('staff-status').value = staff.status || 'Active';
            document.getElementById('staff-address').value = staff.address || '';
        }
    } else {
        document.getElementById('staff-modal-title').textContent = 'Add New Staff Member';
        document.getElementById('staff-joining-date').value = new Date().toISOString().split('T')[0];
    }
    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeStaffModal() {
    const modal = document.getElementById('staff-modal');
    if (modal) modal.style.display = 'none';
}

function saveStaff(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-staff-id').value;
    const name = document.getElementById('staff-name').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const role = document.getElementById('staff-role').value;
    const salaryType = document.getElementById('staff-salary-type').value;
    const salaryRate = Number(document.getElementById('staff-salary-rate').value) || 0;
    const joiningDate = document.getElementById('staff-joining-date').value;
    const status = document.getElementById('staff-status').value;
    const address = document.getElementById('staff-address').value.trim();

    if (editId) {
        const index = staffList.findIndex(s => s.id === editId);
        if (index !== -1) {
            staffList[index] = { ...staffList[index], name, phone, role, salaryType, salaryRate, joiningDate, status, address };
        }
    } else {
        const newId = 'STF' + String(staffList.length + 1).padStart(2, '0');
        staffList.push({ id: newId, name, phone, role, salaryType, salaryRate, joiningDate, status, address });
    }

    localStorage.setItem('mediflow_staff', JSON.stringify(staffList));
    syncToCloud('staff', staffList);
    closeStaffModal();
    renderStaffProfiles();
}

function deleteStaff(staffId) {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    staffList = staffList.filter(s => s.id !== staffId);
    localStorage.setItem('mediflow_staff', JSON.stringify(staffList));
    syncToCloud('staff', staffList);
    renderStaffProfiles();
}

function renderManualAttendance() {
    const picker = document.getElementById('attendance-date-picker');
    if (picker && !picker.value) {
        picker.value = new Date().toISOString().split('T')[0];
    }
    const selectedDate = picker ? picker.value : new Date().toISOString().split('T')[0];
    const tableBody = document.getElementById('attendance-table-body');
    if (!tableBody) return;

    // Load saved logs for selected date
    const existingLog = attendanceLogs.find(l => l.date === selectedDate);
    const savedMap = {};
    if (existingLog && existingLog.records) {
        existingLog.records.forEach(r => { savedMap[r.staffId] = r; });
    }

    const activeStaff = staffList.filter(s => s.status === 'Active');
    tableBody.innerHTML = '';

    if (activeStaff.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No active staff members available. Please add staff first.</td></tr>`;
        return;
    }

    activeStaff.forEach(s => {
        const saved = savedMap[s.id] || { status: 'Present', overtime: 0, remarks: '' };
        const currentStatus = tempDailyAttendance[s.id]?.status || saved.status || 'Present';
        const currentOt = tempDailyAttendance[s.id]?.overtime !== undefined ? tempDailyAttendance[s.id].overtime : (saved.overtime || 0);
        const currentRemarks = tempDailyAttendance[s.id]?.remarks !== undefined ? tempDailyAttendance[s.id].remarks : (saved.remarks || '');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(s.name)}</strong> <small style="color:var(--text-muted);">(${s.id})</small></td>
            <td>${escapeHtml(s.role || '-')}</td>
            <td>
                <div class="attendance-badge-group">
                    <button type="button" class="att-btn ${currentStatus === 'Present' ? 'active-present' : ''}" onclick="setStaffAttStatus('${s.id}', 'Present')">Present</button>
                    <button type="button" class="att-btn ${currentStatus === 'Absent' ? 'active-absent' : ''}" onclick="setStaffAttStatus('${s.id}', 'Absent')">Absent</button>
                    <button type="button" class="att-btn ${currentStatus === 'Half Day' ? 'active-halfday' : ''}" onclick="setStaffAttStatus('${s.id}', 'Half Day')">Half Day</button>
                    <button type="button" class="att-btn ${currentStatus === 'Leave' ? 'active-leave' : ''}" onclick="setStaffAttStatus('${s.id}', 'Leave')">Leave</button>
                </div>
            </td>
            <td>
                <input type="number" step="0.5" class="form-control" style="width: 80px;" value="${currentOt}" onchange="setStaffAttOvertime('${s.id}', this.value)">
            </td>
            <td>
                <input type="text" class="form-control" placeholder="Optional notes" value="${escapeHtml(currentRemarks)}" onchange="setStaffAttRemarks('${s.id}', this.value)">
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function setStaffAttStatus(staffId, status) {
    if (!tempDailyAttendance[staffId]) tempDailyAttendance[staffId] = {};
    tempDailyAttendance[staffId].status = status;
    renderManualAttendance();
}

function setStaffAttOvertime(staffId, ot) {
    if (!tempDailyAttendance[staffId]) tempDailyAttendance[staffId] = {};
    tempDailyAttendance[staffId].overtime = Number(ot) || 0;
}

function setStaffAttRemarks(staffId, remarks) {
    if (!tempDailyAttendance[staffId]) tempDailyAttendance[staffId] = {};
    tempDailyAttendance[staffId].remarks = remarks;
}

function markAllPresent() {
    const activeStaff = staffList.filter(s => s.status === 'Active');
    activeStaff.forEach(s => {
        if (!tempDailyAttendance[s.id]) tempDailyAttendance[s.id] = {};
        tempDailyAttendance[s.id].status = 'Present';
    });
    renderManualAttendance();
}

function saveDailyAttendance() {
    const picker = document.getElementById('attendance-date-picker');
    const selectedDate = picker ? picker.value : new Date().toISOString().split('T')[0];
    if (!selectedDate) {
        alert('Please select a date');
        return;
    }

    const activeStaff = staffList.filter(s => s.status === 'Active');
    const records = activeStaff.map(s => {
        const saved = tempDailyAttendance[s.id] || {};
        const existingLog = attendanceLogs.find(l => l.date === selectedDate);
        const existingRec = existingLog && existingLog.records ? existingLog.records.find(r => r.staffId === s.id) : null;

        return {
            staffId: s.id,
            status: saved.status || (existingRec ? existingRec.status : 'Present'),
            overtime: saved.overtime !== undefined ? saved.overtime : (existingRec ? existingRec.overtime : 0),
            remarks: saved.remarks !== undefined ? saved.remarks : (existingRec ? existingRec.remarks : '')
        };
    });

    const index = attendanceLogs.findIndex(l => l.date === selectedDate);
    if (index !== -1) {
        attendanceLogs[index].records = records;
    } else {
        attendanceLogs.push({ date: selectedDate, records });
    }

    localStorage.setItem('mediflow_attendance', JSON.stringify(attendanceLogs));
    syncToCloud('attendance', attendanceLogs);
    tempDailyAttendance = {};
    alert(`Attendance for ${selectedDate} saved successfully!`);
    renderManualAttendance();
}

function renderStaffAdvances() {
    const tableBody = document.getElementById('advances-table-body');
    const filterSelect = document.getElementById('advance-filter-staff');
    if (!tableBody) return;

    // Populate filter select options
    if (filterSelect) {
        const currentVal = filterSelect.value;
        filterSelect.innerHTML = `<option value="all">All Staff Members</option>`;
        staffList.forEach(s => {
            filterSelect.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
        });
        filterSelect.value = currentVal || 'all';
    }

    const filterStaffId = filterSelect ? filterSelect.value : 'all';
    const filtered = staffAdvances.filter(a => filterStaffId === 'all' || a.staffId === filterStaffId);

    // Compute Totals
    let totalGiven = 0;
    let totalReturned = 0;

    staffAdvances.forEach(a => {
        if (a.type === 'given') totalGiven += Number(a.amount || 0);
        else totalReturned += Number(a.amount || 0);
    });

    if (document.getElementById('advance-stat-given')) document.getElementById('advance-stat-given').textContent = `₹${totalGiven.toFixed(2)}`;
    if (document.getElementById('advance-stat-returned')) document.getElementById('advance-stat-returned').textContent = `₹${totalReturned.toFixed(2)}`;
    if (document.getElementById('advance-stat-net')) document.getElementById('advance-stat-net').textContent = `₹${Math.max(0, totalGiven - totalReturned).toFixed(2)}`;

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No advance transactions recorded</td></tr>`;
        return;
    }

    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(a => {
        const staff = staffList.find(s => s.id === a.staffId) || { name: 'Unknown' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${a.date || '-'}</td>
            <td><strong>${escapeHtml(staff.name)}</strong></td>
            <td>
                <span class="badge-status" style="background:${a.type === 'given' ? '#fee2e2' : '#d1fae5'}; color:${a.type === 'given' ? '#dc2626' : '#065f46'};">
                    ${a.type === 'given' ? 'Advance Given (+)' : 'Return / Deducted (-)'}
                </span>
            </td>
            <td><strong>₹${Number(a.amount || 0).toFixed(2)}</strong></td>
            <td>${escapeHtml(a.paymentMode || 'Cash')}</td>
            <td>${escapeHtml(a.notes || '-')}</td>
            <td>
                <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem; color:#dc2626;" onclick="deleteAdvanceRecord('${a.id}')" title="Delete Transaction">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAdvanceModal(staffId = '', type = 'given') {
    const modal = document.getElementById('advance-modal');
    if (!modal) return;
    document.getElementById('advance-form').reset();

    const staffSelect = document.getElementById('advance-staff-id');
    if (staffSelect) {
        staffSelect.innerHTML = '';
        staffList.forEach(s => {
            staffSelect.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)} (${s.id})</option>`;
        });
        if (staffId) staffSelect.value = staffId;
    }

    document.getElementById('advance-type').value = type;
    document.getElementById('advance-date').value = new Date().toISOString().split('T')[0];
    modal.style.display = 'flex';
}

function closeAdvanceModal() {
    const modal = document.getElementById('advance-modal');
    if (modal) modal.style.display = 'none';
}

function saveAdvanceRecord(e) {
    e.preventDefault();
    const staffId = document.getElementById('advance-staff-id').value;
    const type = document.getElementById('advance-type').value;
    const date = document.getElementById('advance-date').value;
    const amount = Number(document.getElementById('advance-amount').value) || 0;
    const paymentMode = document.getElementById('advance-mode').value;
    const notes = document.getElementById('advance-notes').value.trim();

    if (amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }

    const newId = 'ADV' + Date.now();
    staffAdvances.push({ id: newId, staffId, type, date, amount, paymentMode, notes });

    localStorage.setItem('mediflow_staff_advances', JSON.stringify(staffAdvances));
    syncToCloud('staff_advances', staffAdvances);
    closeAdvanceModal();
    renderStaffAdvances();
    renderStaffProfiles();
}

function deleteAdvanceRecord(id) {
    if (!confirm('Are you sure you want to delete this advance record?')) return;
    staffAdvances = staffAdvances.filter(a => a.id !== id);
    localStorage.setItem('mediflow_staff_advances', JSON.stringify(staffAdvances));
    syncToCloud('staff_advances', staffAdvances);
    renderStaffAdvances();
    renderStaffProfiles();
}

function renderPayroll() {
    const monthPicker = document.getElementById('payroll-month-picker');
    if (monthPicker && !monthPicker.value) {
        const now = new Date();
        const yearStr = now.getFullYear();
        const monthStr = String(now.getMonth() + 1).padStart(2, '0');
        monthPicker.value = `${yearStr}-${monthStr}`;
    }

    const selectedMonth = monthPicker ? monthPicker.value : '';
    const tableBody = document.getElementById('payroll-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    if (staffList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No staff members available.</td></tr>`;
        return;
    }

    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    staffList.forEach(s => {
        // Attendance stats for month
        let presentDays = 0;
        let halfDays = 0;
        let overtimeHours = 0;

        attendanceLogs.forEach(log => {
            if (log.date.startsWith(selectedMonth)) {
                const rec = log.records ? log.records.find(r => r.staffId === s.id) : null;
                if (rec) {
                    if (rec.status === 'Present') presentDays++;
                    else if (rec.status === 'Half Day') halfDays++;
                    overtimeHours += Number(rec.overtime || 0);
                }
            }
        });

        const effectivePresentDays = presentDays + (halfDays * 0.5);
        let grossSalary = 0;
        if (s.salaryType === 'Daily') {
            grossSalary = effectivePresentDays * Number(s.salaryRate || 0);
        } else {
            const dailyRate = Number(s.salaryRate || 0) / (totalDaysInMonth || 30);
            grossSalary = effectivePresentDays > 0 ? dailyRate * effectivePresentDays : Number(s.salaryRate || 0);
        }

        const overtimePay = overtimeHours * 50;
        grossSalary += overtimePay;

        const outstandingAdv = getStaffOutstandingAdvance(s.id);
        const autoAdvanceDeduct = Math.min(outstandingAdv, grossSalary);

        // Check if salary already paid for this month
        const existingPayment = salaryPayments.find(p => p.staffId === s.id && p.monthYear === selectedMonth);
        const netPayable = Math.max(0, grossSalary - autoAdvanceDeduct);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(s.name)}</strong> <br><small style="color:var(--text-muted);">${s.role || ''}</small></td>
            <td>${s.salaryType || 'Monthly'} @ ₹${Number(s.salaryRate || 0).toFixed(2)}</td>
            <td>${effectivePresentDays} / ${totalDaysInMonth} days <br><small style="color:var(--text-muted);">${overtimeHours} hrs OT</small></td>
            <td><strong>₹${grossSalary.toFixed(2)}</strong></td>
            <td style="color:#dc2626;">₹${(existingPayment ? existingPayment.advanceDeducted : autoAdvanceDeduct).toFixed(2)}</td>
            <td style="color:#16a34a;">+₹${(existingPayment ? existingPayment.bonus : 0).toFixed(2)}</td>
            <td style="font-size:1.05rem; font-weight:700; color:var(--primary-color);">
                ₹${(existingPayment ? existingPayment.netPayable : netPayable).toFixed(2)}
            </td>
            <td>
                <span class="badge-status ${existingPayment ? 'badge-paid' : 'badge-unpaid'}">
                    ${existingPayment ? `Paid (₹${existingPayment.amountPaid})` : 'Unpaid'}
                </span>
            </td>
            <td>
                <div style="display:flex; gap:6px;">
                    ${existingPayment ? `
                        <button class="btn btn-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="printPaySlip('${existingPayment.id}')" title="Print Pay Slip">
                            <i data-lucide="printer"></i> Pay Slip
                        </button>
                    ` : `
                        <button class="btn btn-primary" style="padding:4px 10px; font-size:0.8rem;" onclick="openSalaryPayModal('${s.id}', '${selectedMonth}')">
                            <i data-lucide="credit-card"></i> Pay Salary
                        </button>
                    `}
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openSalaryPayModal(staffId, monthYear) {
    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return;

    const modal = document.getElementById('salary-pay-modal');
    if (!modal) return;

    const [year, month] = monthYear.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    let presentDays = 0;
    let halfDays = 0;
    let overtimeHours = 0;

    attendanceLogs.forEach(log => {
        if (log.date.startsWith(monthYear)) {
            const rec = log.records ? log.records.find(r => r.staffId === staff.id) : null;
            if (rec) {
                if (rec.status === 'Present') presentDays++;
                else if (rec.status === 'Half Day') halfDays++;
                overtimeHours += Number(rec.overtime || 0);
            }
        }
    });

    const effectivePresentDays = presentDays + (halfDays * 0.5);
    let grossSalary = 0;
    if (staff.salaryType === 'Daily') {
        grossSalary = effectivePresentDays * Number(staff.salaryRate || 0);
    } else {
        const dailyRate = Number(staff.salaryRate || 0) / (totalDaysInMonth || 30);
        grossSalary = effectivePresentDays > 0 ? dailyRate * effectivePresentDays : Number(staff.salaryRate || 0);
    }
    grossSalary += overtimeHours * 50;

    const outstandingAdv = getStaffOutstandingAdvance(staff.id);
    const suggestedAdvanceDeduct = Math.min(outstandingAdv, grossSalary);

    document.getElementById('sp-staff-id').value = staff.id;
    document.getElementById('sp-month-year').value = monthYear;
    document.getElementById('sp-staff-details').textContent = `Staff: ${staff.name} (${staff.role || 'Staff'}) | Month: ${monthYear}`;
    document.getElementById('sp-calculation-summary').textContent = `Calculated Gross: ₹${grossSalary.toFixed(2)} | Outstanding Advances Balance: ₹${outstandingAdv.toFixed(2)}`;

    document.getElementById('sp-gross-salary').value = grossSalary.toFixed(2);
    document.getElementById('sp-advance-deduction').value = suggestedAdvanceDeduct.toFixed(2);
    document.getElementById('sp-bonus').value = '0';
    document.getElementById('sp-other-deduction').value = '0';
    document.getElementById('sp-payment-date').value = new Date().toISOString().split('T')[0];

    recalculateNetPayable();
    modal.style.display = 'flex';
}

function recalculateNetPayable() {
    const gross = Number(document.getElementById('sp-gross-salary').value) || 0;
    const advDeduct = Number(document.getElementById('sp-advance-deduction').value) || 0;
    const bonus = Number(document.getElementById('sp-bonus').value) || 0;
    const otherDeduct = Number(document.getElementById('sp-other-deduction').value) || 0;

    const net = Math.max(0, gross - advDeduct + bonus - otherDeduct);
    document.getElementById('sp-net-payable').value = net.toFixed(2);
    document.getElementById('sp-amount-paid').value = net.toFixed(2);
}

function closeSalaryPayModal() {
    const modal = document.getElementById('salary-pay-modal');
    if (modal) modal.style.display = 'none';
}

function processSalaryPayment(e) {
    e.preventDefault();
    const staffId = document.getElementById('sp-staff-id').value;
    const monthYear = document.getElementById('sp-month-year').value;
    const grossSalary = Number(document.getElementById('sp-gross-salary').value) || 0;
    const advanceDeducted = Number(document.getElementById('sp-advance-deduction').value) || 0;
    const bonus = Number(document.getElementById('sp-bonus').value) || 0;
    const otherDeductions = Number(document.getElementById('sp-other-deduction').value) || 0;
    const netPayable = Number(document.getElementById('sp-net-payable').value) || 0;
    const amountPaid = Number(document.getElementById('sp-amount-paid').value) || 0;
    const paymentDate = document.getElementById('sp-payment-date').value;
    const paymentMode = document.getElementById('sp-payment-mode').value;
    const referenceNo = document.getElementById('sp-ref-no').value.trim();
    const remarks = document.getElementById('sp-remarks').value.trim();

    if (amountPaid <= 0) {
        alert('Please enter a valid payout amount');
        return;
    }

    const paymentId = 'PAY' + Date.now();
    const paymentRecord = {
        id: paymentId,
        staffId,
        monthYear,
        grossSalary,
        advanceDeducted,
        bonus,
        otherDeductions,
        netPayable,
        amountPaid,
        paymentDate,
        paymentMode,
        referenceNo,
        remarks,
        paidAt: new Date().toISOString()
    };

    salaryPayments.push(paymentRecord);
    localStorage.setItem('mediflow_salary_payments', JSON.stringify(salaryPayments));

    if (advanceDeducted > 0) {
        staffAdvances.push({
            id: 'ADV_DED_' + Date.now(),
            staffId,
            type: 'returned',
            date: paymentDate,
            amount: advanceDeducted,
            paymentMode: 'Salary Deduction',
            notes: `Auto-deducted during ${monthYear} salary payment`
        });
        localStorage.setItem('mediflow_staff_advances', JSON.stringify(staffAdvances));
        syncToCloud('staff_advances', staffAdvances);
    }

    syncToCloud('salary_payments', salaryPayments);
    closeSalaryPayModal();
    alert('Salary payment recorded successfully!');
    renderPayroll();
    printPaySlip(paymentId);
}

function printPaySlip(paymentId) {
    const payment = salaryPayments.find(p => p.id === paymentId);
    if (!payment) return;

    const staff = staffList.find(s => s.id === payment.staffId) || { name: 'Staff Member', role: 'Employee', phone: '' };
    const shopName = settings.shopName || 'T7 BillPro';
    const shopAddress = settings.shopAddress || '';
    const shopPhone = settings.shopPhone || '';

    const container = document.getElementById('payslip-printable-content');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 1rem; margin-bottom: 1rem;">
            <h2 style="margin: 0; color: #2563eb;">${escapeHtml(shopName)}</h2>
            <p style="margin: 2px 0; font-size: 0.85rem; color: #555;">${escapeHtml(shopAddress)}</p>
            <p style="margin: 2px 0; font-size: 0.85rem; color: #555;">Phone: ${escapeHtml(shopPhone)}</p>
            <h3 style="margin-top: 10px; margin-bottom: 0; background: #f1f5f9; display: inline-block; padding: 4px 16px; border-radius: 4px;">SALARY PAY SLIP - ${payment.monthYear}</h3>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 0.9rem;">
            <div>
                <strong>Staff Details:</strong><br>
                Name: ${escapeHtml(staff.name)}<br>
                Designation: ${escapeHtml(staff.role || 'Staff')}<br>
                Phone: ${escapeHtml(staff.phone || '-')}
            </div>
            <div style="text-align: right;">
                <strong>Payment Ref:</strong> ${payment.id}<br>
                <strong>Date:</strong> ${payment.paymentDate}<br>
                <strong>Payment Mode:</strong> ${payment.paymentMode} ${payment.referenceNo ? `(${payment.referenceNo})` : ''}
            </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.9rem;">
            <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                    <th style="padding: 8px;">Description</th>
                    <th style="padding: 8px; text-align: right;">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;">Gross Calculated Salary</td>
                    <td style="padding: 8px; text-align: right;">₹${Number(payment.grossSalary).toFixed(2)}</td>
                </tr>
                ${payment.advanceDeducted > 0 ? `
                <tr style="border-bottom: 1px solid #eee; color: #dc2626;">
                    <td style="padding: 8px;">Less: Advance Deduction</td>
                    <td style="padding: 8px; text-align: right;">-₹${Number(payment.advanceDeducted).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${payment.bonus > 0 ? `
                <tr style="border-bottom: 1px solid #eee; color: #16a34a;">
                    <td style="padding: 8px;">Add: Bonus / Incentive</td>
                    <td style="padding: 8px; text-align: right;">+₹${Number(payment.bonus).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${payment.otherDeductions > 0 ? `
                <tr style="border-bottom: 1px solid #eee; color: #dc2626;">
                    <td style="padding: 8px;">Less: Other Deductions</td>
                    <td style="padding: 8px; text-align: right;">-₹${Number(payment.otherDeductions).toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr style="border-top: 2px solid #333; font-weight: bold; font-size: 1rem;">
                    <td style="padding: 10px 8px;">Net Paid Salary</td>
                    <td style="padding: 10px 8px; text-align: right; color: #2563eb;">₹${Number(payment.amountPaid).toFixed(2)}</td>
                </tr>
            </tbody>
        </table>

        ${payment.remarks ? `<p style="font-size: 0.85rem; color: #666; margin-bottom: 1.5rem;"><strong>Remarks:</strong> ${escapeHtml(payment.remarks)}</p>` : ''}

        <div style="display: flex; justify-content: space-between; margin-top: 3rem; font-size: 0.85rem;">
            <div>_____________________<br>Employer Signature</div>
            <div>_____________________<br>Staff Signature</div>
        </div>
    `;

    const modal = document.getElementById('payslip-modal');
    if (modal) modal.style.display = 'flex';
}

function closePaySlipModal() {
    const modal = document.getElementById('payslip-modal');
    if (modal) modal.style.display = 'none';
}

function triggerPrintPaySlip() {
    window.print();
}

window.switchStaffSubTab = switchStaffSubTab;
window.renderStaffManagement = renderStaffManagement;
window.renderStaffProfiles = renderStaffProfiles;
window.openStaffModal = openStaffModal;
window.closeStaffModal = closeStaffModal;
window.saveStaff = saveStaff;
window.deleteStaff = deleteStaff;
window.renderManualAttendance = renderManualAttendance;
window.setStaffAttStatus = setStaffAttStatus;
window.setStaffAttOvertime = setStaffAttOvertime;
window.setStaffAttRemarks = setStaffAttRemarks;
window.markAllPresent = markAllPresent;
window.saveDailyAttendance = saveDailyAttendance;
window.renderStaffAdvances = renderStaffAdvances;
window.openAdvanceModal = openAdvanceModal;
window.closeAdvanceModal = closeAdvanceModal;
window.saveAdvanceRecord = saveAdvanceRecord;
window.deleteAdvanceRecord = deleteAdvanceRecord;
window.renderPayroll = renderPayroll;
window.openSalaryPayModal = openSalaryPayModal;
window.recalculateNetPayable = recalculateNetPayable;
window.closeSalaryPayModal = closeSalaryPayModal;
window.processSalaryPayment = processSalaryPayment;
window.printPaySlip = printPaySlip;
window.closePaySlipModal = closePaySlipModal;
window.triggerPrintPaySlip = triggerPrintPaySlip;

// --- Customer Digital Menu View & Ordering ---
let isCustomerViewActive = false;
let currentCustomerTable = null;
let currentCustomerTableId = null;
let currentCustomerTableValid = false;

function getTableFromURL() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const match = hash.match(/[?&]table=([^&]+)/) || search.match(/[?&]table=([^&]+)/);
    if (match && match[1]) return decodeURIComponent(match[1].replace(/\+/g, ' '));
    return null;
}

function getTableIdFromURL() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const match = hash.match(/[?&]tableId=([^&]+)/) || search.match(/[?&]tableId=([^&]+)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
    return null;
}

function validateCustomerTable() {
    const tableId = getTableIdFromURL();
    const tableName = getTableFromURL();
    currentCustomerTableId = tableId || null;
    currentCustomerTableValid = false;
    if (!tableId && !tableName) { currentCustomerTable = null; return true; }
    const list = Array.isArray(tableList) ? tableList : [];
    let table = tableId ? list.find(t => String(t.id) === String(tableId)) : null;
    if (!table && tableName) {
        const clean = String(tableName).trim().toLowerCase();
        table = list.find(t => String(t.name || '').trim().toLowerCase() === clean);
    }
    if (!table || (table.branchId && String(table.branchId) !== String(currentBranchId))) {
        currentCustomerTable = null;
        currentCustomerTableValid = false;
        return false;
    }
    currentCustomerTable = table.name;
    currentCustomerTableId = table.id;
    currentCustomerTableValid = true;
    return true;
}

function enableCustomerMenuView() {
    isCustomerViewActive = true;
    if (document.body) document.body.classList.add('customer-mode');
    
    if (typeof showMenuLoadingScreen === 'function') showMenuLoadingScreen('Loading Digital Menu...', 'Connecting live branch catalog...');
    if (typeof showMenuCardSkeleton === 'function') showMenuCardSkeleton();

    const branchFromUrl = typeof getBranchIdFromURL === 'function' ? getBranchIdFromURL() : null;
    if (branchFromUrl) {
        currentBranchId = branchFromUrl;
        sessionStorage.setItem('mediflow_current_branch', branchFromUrl);
    }

    const tableFromUrl = getTableFromURL();
    const tableIdFromUrl = getTableIdFromURL();
    if (tableFromUrl || tableIdFromUrl) {
        if (!validateCustomerTable()) {
            currentCustomerTable = null;
            currentCustomerTableId = null;
            currentCustomerTableValid = false;
        }
    }

    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) {
        appContainer.style.display = 'flex';
        appContainer.classList.add('active-app');
    }

    loadBranchData();

    // Populate customer header with shop info
    const currentBranchObj = (typeof branches !== 'undefined' && Array.isArray(branches)) ? branches.find(b => b.id === currentBranchId) : null;
    if (document.getElementById('cust-shop-name')) {
        document.getElementById('cust-shop-name').textContent = settings.shopName || (currentBranchObj ? currentBranchObj.name : 'T7 BillPro');
    }
    if (document.getElementById('cust-shop-phone')) {
        let text = settings.shopAddress ? `${settings.shopAddress} | ${settings.shopPhone || ''}` : (settings.shopPhone || 'Digital Catalog & Menu');
        if (currentCustomerTable) {
            text = `📍 ${currentCustomerTable} • ${text}`;
        }
        document.getElementById('cust-shop-phone').textContent = text;
    }

    switchSection('menu-card');
    
    // Async non-blocking render frame
    requestAnimationFrame(() => {
        if (typeof renderMenuCard === 'function') renderMenuCard();
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Dedicated Cake Order QR links open the customer menu first, then
        // immediately open the customized-cake form. This keeps the same
        // branch context and avoids sending customers to the admin/login view.
        const cakeRequested = window.location.hash.includes('cake=1') ||
                              new URLSearchParams(window.location.search).get('action') === 'order_cake';
        if (cakeRequested && typeof openCustomCakeModal === 'function') {
            setTimeout(() => openCustomCakeModal(), 120);
        }

        if (typeof hideMenuLoadingScreen === 'function') hideMenuLoadingScreen();
    });
}

function openAdminLoginFromCustomerView() {
    document.body.classList.remove('customer-mode');
    sessionStorage.removeItem('mediflow_logged_in');
    sessionStorage.removeItem('mediflow_user');
    window.location.hash = '';
    window.location.reload();
}

function closeMenuSuccessModal() {
    const modal = document.getElementById('menu-order-success-modal');
    if (modal) modal.style.display = 'none';
}

function checkAndEnableCustomerMenu() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const isMenuUrl = hash.includes('menu') || search.includes('table=') || search.includes('branch=');
    const isLoggedIn = sessionStorage.getItem('mediflow_logged_in') === 'true';
    
    if (isMenuUrl && !isLoggedIn) {
        enableCustomerMenuView();
    }
}

window.addEventListener('hashchange', checkAndEnableCustomerMenu);
window.addEventListener('DOMContentLoaded', checkAndEnableCustomerMenu);

window.enableCustomerMenuView = enableCustomerMenuView;
window.openAdminLoginFromCustomerView = openAdminLoginFromCustomerView;
window.closeMenuSuccessModal = closeMenuSuccessModal;
window.getTableFromURL = getTableFromURL;
window.getTableIdFromURL = getTableIdFromURL;
window.validateCustomerTable = validateCustomerTable;
window.renderBranches = renderBranches;
window.openBranchModal = openBranchModal;
window.closeBranchModal = closeBranchModal;
window.toggleBranchLock = toggleBranchLock;
window.changeBranchAMC = changeBranchAMC;
window.deleteBranch = deleteBranch;
window.getBranchIdFromURL = getBranchIdFromURL;
window.getDigitalMenuURL = getDigitalMenuURL;
window.copyBranchMenuLink = copyBranchMenuLink;
window.shareBranchMenuWhatsApp = shareBranchMenuWhatsApp;
window.openBranchMenuLink = openBranchMenuLink;

// --- KOT (Kitchen Order Ticket) Feature ---
function loadSettingsFields() {
    if (document.getElementById('set-shop-name')) document.getElementById('set-shop-name').value = settings.shopName || '';
    if (document.getElementById('set-shop-address')) document.getElementById('set-shop-address').value = settings.shopAddress || '';
    if (document.getElementById('set-shop-phone')) document.getElementById('set-shop-phone').value = settings.shopPhone || '';
    if (document.getElementById('set-shop-gstin')) document.getElementById('set-shop-gstin').value = settings.shopGstin || '';
    if (document.getElementById('set-shop-logo')) document.getElementById('set-shop-logo').value = settings.shopLogo || '';
    if (document.getElementById('set-shop-upi')) document.getElementById('set-shop-upi').value = settings.shopUpi || '';
    if (document.getElementById('set-printer-type')) document.getElementById('set-printer-type').value = settings.printerType || '3inch';
    if (document.getElementById('set-printer-name')) document.getElementById('set-printer-name').value = settings.printerName || 'Default System Printer';
    if (document.getElementById('set-print-copies')) document.getElementById('set-print-copies').value = settings.printCopies || 1;
    if (document.getElementById('set-gst-default')) document.getElementById('set-gst-default').checked = (settings.gstDefault !== false);
    if (document.getElementById('set-kot-enabled')) document.getElementById('set-kot-enabled').checked = (settings.kotEnabled !== false);
    if (document.getElementById('set-enable-waiter')) document.getElementById('set-enable-waiter').checked = !!settings.enableWaiterSelect;
    if (document.getElementById('set-enable-doctor')) document.getElementById('set-enable-doctor').checked = !!settings.enableDoctorSelect;
    if (document.getElementById('set-enable-table-mgmt')) document.getElementById('set-enable-table-mgmt').checked = !!settings.enableTableMgmt;
    if (document.getElementById('set-enable-table-qr')) document.getElementById('set-enable-table-qr').checked = (settings.enableTableQr !== false);
    if (document.getElementById('set-enable-menu-card')) document.getElementById('set-enable-menu-card').checked = (settings.enableMenuCard !== false);
    if (document.getElementById('set-enable-digital-orders')) document.getElementById('set-enable-digital-orders').checked = (settings.enableDigitalOrders !== false);
    if (document.getElementById('set-enable-custom-cake-orders')) document.getElementById('set-enable-custom-cake-orders').checked = (settings.enableCustomCakeOrders !== false);
    if (document.getElementById('set-print-mode')) document.getElementById('set-print-mode').value = settings.printMode || 'preview';
    if (document.getElementById('set-currency')) document.getElementById('set-currency').value = settings.currency || '₹';

    updatePrintModeUI();

    const kotBtn = document.getElementById('print-kot-btn');
    if (kotBtn) kotBtn.style.display = (settings.kotEnabled !== false) ? 'inline-flex' : 'none';

    const navMenuCard = document.querySelector('.nav-item[data-section="menu-card"]');
    if (navMenuCard) navMenuCard.style.display = (settings.enableMenuCard !== false) ? 'flex' : 'none';

    const navDigitalOrders = document.querySelector('.nav-item[data-section="digital-orders"]');
    if (navDigitalOrders) navDigitalOrders.style.display = (settings.enableDigitalOrders !== false) ? 'flex' : 'none';

    const cakeHeroBtn = document.getElementById('btn-custom-cake-hero');
    if (cakeHeroBtn) cakeHeroBtn.style.display = (settings.enableCustomCakeOrders !== false) ? 'inline-flex' : 'none';
    const cakeCategoryPill = document.getElementById('category-pill-custom-cake');
    if (cakeCategoryPill) cakeCategoryPill.style.display = (settings.enableCustomCakeOrders !== false) ? 'inline-flex' : 'none';

    const navDoctorMgmt = document.getElementById('nav-doctor-mgmt');
    if (navDoctorMgmt) navDoctorMgmt.style.display = (settings.enableDoctorSelect !== false) ? 'flex' : 'none';

    if (typeof renderSuperAdminSettingsPermissions === 'function') renderSuperAdminSettingsPermissions();
    if (typeof applyBranchSettingsPermissions === 'function') applyBranchSettingsPermissions();
}

// --- Print Preview & Mode Management ---
let pendingPrintCallback = null;

function togglePrintMode() {
    settings.printMode = (settings.printMode === 'silent') ? 'preview' : 'silent';
    localStorage.setItem('mediflow_settings', JSON.stringify(settings));
    updatePrintModeUI();
    if (typeof showMenuToast === 'function') {
        showMenuToast(`Print Mode set to: ${settings.printMode === 'silent' ? '⚡ Silent Direct Print' : '👁️ Show Print Preview'}`);
    }
}

function onPrintModeSettingChange(val) {
    settings.printMode = val || 'preview';
    localStorage.setItem('mediflow_settings', JSON.stringify(settings));
    updatePrintModeUI();
}

function updatePrintModeUI() {
    const isSilent = (settings.printMode === 'silent');
    const label = document.getElementById('print-mode-label');
    const btn = document.getElementById('btn-toggle-print-mode');
    const select = document.getElementById('set-print-mode');

    if (label) label.textContent = isSilent ? 'Silent Print' : 'Preview Mode';
    if (btn) {
        btn.style.borderColor = isSilent ? '#16a34a' : '#0284c7';
        btn.style.color = isSilent ? '#16a34a' : '#0284c7';
        btn.title = isSilent ? 'Silent Print ON: Direct printing without on-screen preview modal' : 'Preview Mode ON: Shows on-screen receipt preview modal before printing';
    }
    if (select) select.value = isSilent ? 'silent' : 'preview';
}

function openPrintPreviewModal(billHtml, printCallback) {
    pendingPrintCallback = printCallback;
    const modal = document.getElementById('modal-print-preview');
    const container = document.getElementById('print-preview-container');
    if (container) container.innerHTML = billHtml;
    if (modal) modal.style.display = 'flex';
}

function closePrintPreviewModal() {
    const modal = document.getElementById('modal-print-preview');
    if (modal) modal.style.display = 'none';
    pendingPrintCallback = null;
}

function confirmPrintFromPreview() {
    const callback = pendingPrintCallback;
    closePrintPreviewModal();
    if (typeof callback === 'function') {
        callback();
    }
}

window.togglePrintMode = togglePrintMode;
window.onPrintModeSettingChange = onPrintModeSettingChange;
window.openPrintPreviewModal = openPrintPreviewModal;
window.closePrintPreviewModal = closePrintPreviewModal;
window.confirmPrintFromPreview = confirmPrintFromPreview;

function printKOT() {
    if (!cart || cart.length === 0) {
        alert('Cart is empty. Please add items to print Kitchen Order Ticket (KOT).');
        return;
    }

    const shopName = settings.shopName || 'T7 BillPro';
    const invoiceNo = document.getElementById('invoice-number')?.value || ('KOT-' + String(Date.now()).slice(-4));
    const custName = document.getElementById('customer-name')?.value || 'Walk-in Customer';
    const custPhone = document.getElementById('customer-phone')?.value || '';
    const nowStr = new Date().toLocaleString();
    const copies = Math.max(1, Number(settings.printCopies || 1));
    const printerName = settings.printerName || 'Default System Printer';

    let itemsHtml = '';
    cart.forEach((item, index) => {
        itemsHtml += `
            <tr style="border-bottom: 1px dashed #cbd5e1;">
                <td style="padding: 6px 0; font-size: 1rem;">${index + 1}. <strong>${escapeHtml(item.name)}</strong></td>
                <td style="padding: 6px 0; text-align: right; font-size: 1.1rem; font-weight: bold;">${item.quantity || item.qty || 1}</td>
            </tr>
        `;
    });

    let ticketsHtml = '';
    const copyLabels = ['KITCHEN COPY', 'PANTRY COPY', 'COUNTER COPY', 'EXTRA COPY'];

    for (let i = 0; i < copies; i++) {
        const copyTag = copyLabels[i] || `COPY ${i + 1}`;
        ticketsHtml += `
            <div class="kot-ticket" style="${i > 0 ? 'page-break-before: always; margin-top: 20px;' : ''}">
                <div class="header">
                    <h2>KITCHEN ORDER TICKET</h2>
                    <h3>${escapeHtml(shopName)}</h3>
                    <div style="font-size: 0.8rem; font-weight: bold; background: #000; color: #fff; display: inline-block; padding: 2px 8px; border-radius: 4px; margin-top: 4px;">${copyTag} (${i + 1}/${copies})</div>
                </div>
                <div class="meta">
                    <div><strong>Ref / Token:</strong> ${escapeHtml(invoiceNo)}</div>
                    <div><strong>Date & Time:</strong> ${nowStr}</div>
                    <div><strong>Customer / Table:</strong> ${escapeHtml(custName)} ${custPhone ? `(${custPhone})` : ''}</div>
                    ${printerName ? `<div style="font-size: 0.75rem; color: #555;">Target Printer: ${escapeHtml(printerName)}</div>` : ''}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>ITEM NAME</th>
                            <th style="text-align: right;">QTY</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                <div class="footer">
                    *** ${copyTag} ***
                </div>
            </div>
        `;
    }

    let kotIframe = document.getElementById('kot-print-iframe');
    if (!kotIframe) {
        kotIframe = document.createElement('iframe');
        kotIframe.id = 'kot-print-iframe';
        kotIframe.style.display = 'none';
        document.body.appendChild(kotIframe);
    }

    const iframeDoc = kotIframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>KOT - ${invoiceNo} (${copies} Copies)</title>
            <style>
                body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 12px; color: #000; width: 280px; }
                .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
                .header h2 { margin: 0; font-size: 1.25rem; text-transform: uppercase; letter-spacing: 1px; }
                .header h3 { margin: 4px 0 0 0; font-size: 0.95rem; color: #333; }
                .meta { font-size: 0.85rem; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
                th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 4px; font-size: 0.85rem; }
                .footer { text-align: center; border-top: 2px dashed #000; padding-top: 8px; font-size: 0.85rem; font-weight: bold; }
                @media print {
                    .kot-ticket { page-break-after: always; }
                    .kot-ticket:last-child { page-break-after: avoid; }
                }
            </style>
        </head>
        <body onload="setTimeout(() => { window.print(); }, 150);">
            ${ticketsHtml}
        </body>
        </html>
    `);
    iframeDoc.close();
}

window.loadSettingsFields = loadSettingsFields;
window.printKOT = printKOT;

// --- Product Deduplication & Smart Import ---

function removeDuplicateProducts() {
    if (!products || products.length === 0) {
        alert('Product list is empty.');
        return;
    }

    const initialCount = products.length;
    const nameMap = {};
    const deduplicatedProducts = [];
    let mergedCount = 0;

    products.forEach(p => {
        const normName = (p.name || '').trim().toLowerCase();
        if (!normName) return;

        if (nameMap[normName]) {
            // Duplicate found! Add stock to existing product
            const existing = nameMap[normName];
            existing.stock = Number(existing.stock || 0) + Number(p.stock || 0);

            // Update prices if duplicate has higher/newer price
            if (Number(p.mrp || 0) > Number(existing.mrp || 0)) existing.mrp = p.mrp;
            if (Number(p.salePrice || 0) > Number(existing.salePrice || 0)) existing.salePrice = p.salePrice;
            if (!existing.hsn && p.hsn) existing.hsn = p.hsn;
            if (!existing.batch && p.batch) existing.batch = p.batch;
            if (!existing.expiry && p.expiry) existing.expiry = p.expiry;

            mergedCount++;
        } else {
            // First occurrence: store copy
            const copy = { ...p, stock: Number(p.stock || 0) };
            nameMap[normName] = copy;
            deduplicatedProducts.push(copy);
        }
    });

    if (mergedCount === 0) {
        alert('No duplicate products found.');
        return;
    }

    products = deduplicatedProducts;
    localStorage.setItem('mediflow_products', JSON.stringify(products));
    syncToCloud('products', products);

    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderProductDropdown === 'function') renderProductDropdown();

    alert(`Successfully merged ${mergedCount} duplicate product entry(s)!\n\n- Original Total Items: ${initialCount}\n- New Clean Items: ${products.length}`);
}

function handleProductImportFile(file) {
    if (!file) return;
    const fakeEvent = { target: { files: [file], value: '' } };
    if (typeof importProducts === 'function') {
        importProducts(fakeEvent);
    }
}

function parseProductsCSV(csvText) {
    const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const items = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        if (values.length < 1 || !values[0]) continue;

        const rowObj = {};
        headers.forEach((h, idx) => {
            rowObj[h] = values[idx] || '';
        });

        items.push({
            name: rowObj['name'] || rowObj['product name'] || rowObj['item'] || values[0],
            category: rowObj['category'] || values[1] || 'Other',
            unit: rowObj['unit'] || values[2] || 'Pcs',
            hsn: rowObj['hsn'] || values[3] || '',
            batch: rowObj['batch'] || values[4] || '',
            expiry: rowObj['expiry'] || values[5] || '',
            mrp: Number(rowObj['mrp'] || values[6] || 0),
            salePrice: Number(rowObj['saleprice'] || rowObj['sale price'] || values[7] || rowObj['mrp'] || 0),
            stock: Number(rowObj['stock'] || rowObj['qty'] || values[8] || 0),
            gst: Number(rowObj['gst'] || values[9] || 12)
        });
    }

    return items;
}

window.removeDuplicateProducts = removeDuplicateProducts;
window.handleProductImportFile = handleProductImportFile;
window.parseProductsCSV = parseProductsCSV;

// --- Product Barcode Label Printing Module ---

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

let selectedBarcodeProductId = null;

function renderBarcodeProductOptions() {
    const select = document.getElementById('lbl-product-select');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Select a Product...</option>';

    if (!products || products.length === 0) return;

    const sorted = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    sorted.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} | Stock: ${p.stock || 0} | ₹${p.salePrice || p.mrp || 0}`;
        if (p.id === currentVal) opt.selected = true;
        select.appendChild(opt);
    });

    if (settings && settings.printerName && document.getElementById('lbl-printer-path')) {
        if (!document.getElementById('lbl-printer-path').value) {
            document.getElementById('lbl-printer-path').value = settings.printerName || '';
        }
    }
}

function onBarcodeProductSelect() {
    const select = document.getElementById('lbl-product-select');
    if (!select) return;

    selectedBarcodeProductId = select.value;
    const prod = products.find(p => p.id === selectedBarcodeProductId);
    if (prod && prod.stock > 0) {
        document.getElementById('lbl-quantity').value = Math.min(Math.max(1, prod.stock), 100);
    }
    renderBarcodeLabelsPreview();
}

function useCurrentProductStockQty() {
    const select = document.getElementById('lbl-product-select');
    if (!select || !select.value) {
        alert('Please select a product first.');
        return;
    }
    const prod = products.find(p => p.id === select.value);
    if (prod) {
        document.getElementById('lbl-quantity').value = Math.max(1, Number(prod.stock || 1));
        renderBarcodeLabelsPreview();
    }
}

function renderBarcodeLabelsPreview() {
    const container = document.getElementById('barcode-stickers-container');
    const countSpan = document.getElementById('lbl-preview-count');
    if (!container) return;

    const productId = document.getElementById('lbl-product-select')?.value;
    const prod = products.find(p => p.id === productId);

    if (!prod) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 3rem;">Please select a product from the left menu to preview barcode stickers.</div>';
        if (countSpan) countSpan.textContent = '0 Stickers';
        return;
    }

    const qty = Math.min(Math.max(1, Number(document.getElementById('lbl-quantity')?.value || 1)), 500);
    const size = document.getElementById('lbl-size')?.value || '50x25';
    const showLogo = document.getElementById('lbl-show-logo')?.checked !== false;
    const showShop = document.getElementById('lbl-show-shop')?.checked !== false;
    const showName = document.getElementById('lbl-show-name')?.checked !== false;
    const showPrice = document.getElementById('lbl-show-price')?.checked !== false;
    const showExpiry = document.getElementById('lbl-show-expiry')?.checked !== false;
    const showBarcode = document.getElementById('lbl-show-barcode')?.checked !== false;
    const shopName = settings.shopName || 'T7 BillPro';
    const shopLogo = settings.shopLogo || '';

    if (countSpan) countSpan.textContent = `${qty} Sticker(s) Preview (${size})`;

    let stickersHtml = '';
    const codeVal = prod.id || ('PROD-' + prod.name.replace(/\s+/g, '').toUpperCase());
    const barSvg = generateCode128Svg(codeVal);

    for (let i = 0; i < Math.min(qty, 36); i++) {
        stickersHtml += `
            <div class="barcode-sticker-card" style="width: 220px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; font-family: sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,0.1); color: #000;">
                ${(showLogo && shopLogo) ? `<div style="text-align: center; margin-bottom: 2px;"><img src="${shopLogo}" style="max-height: 18px; max-width: 60px; object-fit: contain;"></div>` : ''}
                ${showShop ? `<div style="font-size: 0.7rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; margin-bottom: 2px;">${escapeHtml(shopName)}</div>` : ''}
                ${showName ? `<div style="font-size: 0.85rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 3px;">${escapeHtml(prod.name)}</div>` : ''}
                
                ${showPrice ? `
                    <div style="font-size: 0.8rem; font-weight: 700; margin-bottom: 3px;">
                        Sale: ₹${prod.salePrice || prod.mrp || 0} ${prod.mrp ? `<span style="font-weight: normal; text-decoration: line-through; color: #64748b; font-size: 0.72rem;">MRP: ₹${prod.mrp}</span>` : ''}
                    </div>
                ` : ''}

                ${showExpiry && (prod.batch || prod.expiry) ? `
                    <div style="font-size: 0.68rem; color: #334155; margin-bottom: 3px;">
                        ${prod.batch ? `B.No: ${escapeHtml(prod.batch)}` : ''} ${prod.expiry ? `Exp: ${escapeHtml(prod.expiry)}` : ''}
                    </div>
                ` : ''}

                ${showBarcode ? `
                    <div style="margin: 4px 0 2px 0;">
                        ${barSvg}
                        <div style="font-size: 0.65rem; font-family: monospace; letter-spacing: 1px; color: #000; font-weight: bold;">*${escapeHtml(codeVal)}*</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (qty > 36) {
        stickersHtml += `<div style="width: 100%; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 8px;">... and ${qty - 36} more stickers ready for printing.</div>`;
    }

    container.innerHTML = stickersHtml;
}

function generateCode128Svg(text) {
    let barsHtml = '';
    let x = 10;
    
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const w1 = (charCode % 3) + 1;
        const w2 = ((charCode * 2) % 3) + 1;
        
        barsHtml += `<rect x="${x}" y="0" width="${w1}" height="28" fill="#000" />`;
        x += w1 + w2;
    }
    
    barsHtml += `<rect x="${x}" y="0" width="3" height="28" fill="#000" />`;
    x += 5;

    return `<svg width="100%" height="28" viewBox="0 0 ${Math.max(x, 140)} 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${barsHtml}</svg>`;
}

function printBarcodeLabels() {
    const productId = document.getElementById('lbl-product-select')?.value;
    const prod = products.find(p => p.id === productId);

    if (!prod) {
        alert('Please select a product to print barcode labels.');
        return;
    }

    const qty = Math.max(1, Number(document.getElementById('lbl-quantity')?.value || 1));
    const size = document.getElementById('lbl-size')?.value || '50x25';
    const printerPath = document.getElementById('lbl-printer-path')?.value || settings.printerName || 'Default System Printer';
    const showLogo = document.getElementById('lbl-show-logo')?.checked !== false;
    const showShop = document.getElementById('lbl-show-shop')?.checked !== false;
    const showName = document.getElementById('lbl-show-name')?.checked !== false;
    const showPrice = document.getElementById('lbl-show-price')?.checked !== false;
    const showExpiry = document.getElementById('lbl-show-expiry')?.checked !== false;
    const showBarcode = document.getElementById('lbl-show-barcode')?.checked !== false;
    const shopName = settings.shopName || 'T7 BillPro';
    const shopLogo = settings.shopLogo || '';
    const codeVal = prod.id || ('PROD-' + prod.name.replace(/\s+/g, '').toUpperCase());
    const barSvg = generateCode128Svg(codeVal);

    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('Please allow popups to print barcode labels.');
        return;
    }

    let stickerWidth = '33mm';
    let stickerHeight = '33.5mm';
    let pageSize = '102mm 34mm';
    let containerCss = 'display: grid; grid-template-columns: repeat(3, 33mm); column-gap: 1.5mm; row-gap: 1.5mm; width: 102mm; margin: 0 auto;';

    if (size === '33x34_3up') {
        stickerWidth = '33mm';
        stickerHeight = '33.5mm';
        pageSize = '102mm 34mm';
        containerCss = 'display: grid; grid-template-columns: repeat(3, 33mm); column-gap: 1.5mm; row-gap: 1.5mm; width: 102mm; margin: 0 auto;';
    } else if (size === '102x34') {
        stickerWidth = '100mm';
        stickerHeight = '33.5mm';
        pageSize = '102mm 34mm';
        containerCss = 'display: flex; flex-direction: column; gap: 2mm; width: 102mm; margin: 0 auto;';
    } else if (size === '38x25') {
        stickerWidth = '36mm';
        stickerHeight = '23mm';
        pageSize = 'auto';
        containerCss = 'display: flex; flex-wrap: wrap; gap: 2mm; justify-content: flex-start;';
    } else if (size === '40x30') {
        stickerWidth = '38mm';
        stickerHeight = '28mm';
        pageSize = 'auto';
        containerCss = 'display: flex; flex-wrap: wrap; gap: 2mm; justify-content: flex-start;';
    } else if (size === '3inch') {
        stickerWidth = '76mm';
        stickerHeight = '30mm';
        pageSize = '80mm auto';
        containerCss = 'display: flex; flex-direction: column; gap: 2mm; width: 78mm; margin: 0 auto;';
    } else {
        stickerWidth = '48mm';
        stickerHeight = '23mm';
        pageSize = 'auto';
        containerCss = 'display: flex; flex-wrap: wrap; gap: 2mm; justify-content: flex-start;';
    }

    let stickersHtml = '';
    for (let i = 0; i < qty; i++) {
        stickersHtml += `
            <div class="sticker-box">
                ${(showLogo && shopLogo) ? `<div style="text-align: center; margin-bottom: 1px;"><img src="${shopLogo}" style="max-height: 14px; max-width: 50px; object-fit: contain;"></div>` : ''}
                ${showShop ? `<div class="shop-title">${escapeHtml(shopName)}</div>` : ''}
                ${showName ? `<div class="prod-title">${escapeHtml(prod.name)}</div>` : ''}
                ${showPrice ? `<div class="price-line">Price: <strong>₹${prod.salePrice || prod.mrp || 0}</strong> ${prod.mrp ? `<span class="mrp">MRP: ₹${prod.mrp}</span>` : ''}</div>` : ''}
                ${showExpiry && (prod.batch || prod.expiry) ? `<div class="exp-line">${prod.batch ? `B:${escapeHtml(prod.batch)}` : ''} ${prod.expiry ? `E:${escapeHtml(prod.expiry)}` : ''}</div>` : ''}
                ${showBarcode ? `
                    <div class="barcode-wrapper">
                        ${barSvg}
                        <div class="code-str">*${escapeHtml(codeVal)}*</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Barcode Labels - ${escapeHtml(prod.name)} (${qty} Stickers)</title>
            <style>
                @page { margin: 1mm; size: ${pageSize}; }
                body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 2mm; color: #000; background: #fff; }
                .printer-info { font-size: 0.75rem; color: #64748b; margin-bottom: 8px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; }
                .stickers-wrapper { ${containerCss} }
                .sticker-box {
                    width: ${stickerWidth};
                    height: ${stickerHeight};
                    box-sizing: border-box;
                    border: 1px solid #94a3b8;
                    border-radius: 4px;
                    padding: 2mm;
                    text-align: center;
                    overflow: hidden;
                    page-break-inside: avoid;
                    background: #fff;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }
                .shop-title { font-size: 6.5pt; font-weight: bold; text-transform: uppercase; line-height: 1.1; color: #334155; }
                .prod-title { font-size: 7.5pt; font-weight: bold; line-height: 1.1; max-height: 2.2em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
                .price-line { font-size: 7pt; margin-top: 1px; }
                .price-line .mrp { font-size: 6pt; text-decoration: line-through; color: #64748b; }
                .exp-line { font-size: 6pt; color: #334155; }
                .barcode-wrapper { width: 100%; margin-top: 2px; text-align: center; }
                .code-str { font-size: 5.5pt; font-family: monospace; font-weight: bold; }
                @media print {
                    .printer-info { display: none; }
                    .sticker-box { border: 1px solid #cbd5e1; }
                }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div class="printer-info">
                Target Label Printer: <strong>${escapeHtml(printerPath)}</strong> | Size: ${size} | Total Stickers: ${qty}
            </div>
            <div class="stickers-wrapper">
                ${stickersHtml}
            </div>
        </body>
        </html>
    `);
    printWin.document.close();
}

window.renderBarcodeProductOptions = renderBarcodeProductOptions;
window.onBarcodeProductSelect = onBarcodeProductSelect;
window.useCurrentProductStockQty = useCurrentProductStockQty;
window.renderBarcodeLabelsPreview = renderBarcodeLabelsPreview;
window.generateCode128Svg = generateCode128Svg;
window.printBarcodeLabels = printBarcodeLabels;

// --- Waiter & Doctor Billing Options & Sales Reports ---

function renderBillingWaiterOptions() {
    const select = document.getElementById('billing-waiter-select');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Select Waiter / Staff (Optional)</option>';

    const activeStaff = (staffList || []).filter(s => 
        (s.status || 'Active').toLowerCase() === 'active' && 
        (!s.branchId || s.branchId === currentBranchId)
    );
    activeStaff.forEach(stf => {
        const opt = document.createElement('option');
        opt.value = stf.name;
        opt.textContent = `${stf.name} (${stf.role || 'Staff'})`;
        if (stf.name === currentVal) opt.selected = true;
        select.appendChild(opt);
    });
}

function renderBillingDoctorOptions() {
    const datalist = document.getElementById('doctor-suggestions-list');
    if (!datalist) return;

    datalist.innerHTML = '';
    const doctorSet = new Set();

    (doctorsList || []).forEach(d => {
        if (d && d.name && d.name.trim()) {
            doctorSet.add(d.name.trim());
        }
    });

    (sales || []).forEach(s => {
        if (s.doctorName && s.doctorName.trim()) {
            doctorSet.add(s.doctorName.trim());
        }
    });

    doctorSet.forEach(docName => {
        const opt = document.createElement('option');
        opt.value = docName;
        datalist.appendChild(opt);
    });
}


// ==================== BALANCE / CASH MANAGEMENT ====================
function balanceCurrency(v) {
    const n = Number(v) || 0;
    return `${settings.currency || '₹'}${n.toFixed(2)}`;
}

function balanceDateValue() {
    return document.getElementById('bal-date')?.value || new Date().toISOString().slice(0,10);
}

function isCashMode(mode) {
    const m = String(mode || 'Cash').toLowerCase();
    return m === 'cash' || m === 'cash payment' || m.includes('cash');
}

function getBalanceForDate(date) {
    const daySales = sales.filter(s => s && !s.isCancelled && String(s.date || '').slice(0,10) === date && isCashMode(s.paymentMode) && s.paymentMode !== 'Credit');
    const cashSales = daySales.reduce((a,s) => a + (Number(s.grandTotal)||0), 0);
    const dayCustomerPayments = customerPayments.filter(p => String(p.date || '').slice(0,10) === date && isCashMode(p.method));
    const customerCashIn = dayCustomerPayments.reduce((a,p) => a + (Number(p.amount)||0), 0);
    const dayPurchases = purchases.filter(p => String(p.date || '').slice(0,10) === date && isCashMode(p.paymentMode));
    const cashPurchases = dayPurchases.reduce((a,p) => a + (Number(p.grandTotal || p.total)||0), 0);
    const daySupplierPayments = supplierPayments.filter(p => String(p.date || '').slice(0,10) === date && isCashMode(p.method));
    const supplierCashOut = daySupplierPayments.reduce((a,p) => a + (Number(p.amount)||0), 0);
    const dayExpenses = expenses.filter(e => String(e.date || '').slice(0,10) === date);
    const expenseCashOut = dayExpenses.reduce((a,e) => a + (Number(e.amount)||0), 0);
    const dayAdvances = staffAdvances.filter(a => String(a.date || '').slice(0,10) === date && isCashMode(a.paymentMode) && String(a.type || '').toLowerCase() !== 'returned');
    const staffCashOut = dayAdvances.reduce((a,x) => a + (Number(x.amount)||0), 0);
    const daySalary = salaryPayments.filter(p => String(p.paymentDate || p.paidAt || '').slice(0,10) === date && isCashMode(p.paymentMode));
    const salaryCashOut = daySalary.reduce((a,p) => a + (Number(p.amountPaid)||0), 0);
    const dayManual = cashTransactions.filter(t => String(t.date || '').slice(0,10) === date);
    const manualIn = dayManual.filter(t => t.type === 'in').reduce((a,t) => a + (Number(t.amount)||0), 0);
    const manualOut = dayManual.filter(t => t.type === 'out').reduce((a,t) => a + (Number(t.amount)||0), 0);
    const opening = Number(cashOpenings[date] || 0);
    const cashIn = cashSales + customerCashIn + manualIn;
    const cashOut = cashPurchases + supplierCashOut + expenseCashOut + staffCashOut + salaryCashOut + manualOut;
    const expected = opening + cashIn - cashOut;
    const record = (cashOpenings && cashOpenings[date] && typeof cashOpenings[date] === 'object') ? cashOpenings[date] : {};
    const counted = record.counted === undefined || record.counted === '' ? null : Number(record.counted);
    return {date, opening, cashSales, customerCashIn, manualIn, cashPurchases, supplierCashOut, expenseCashOut, staffCashOut, salaryCashOut, manualOut, cashIn, cashOut, expected, counted, variance: counted === null ? null : counted - expected, note: record.note || ''};
}

function getBalancePosition() {
    let receivable = 0;
    customers.forEach(c => {
        const phone = c.phone;
        const credit = sales.filter(s => s.customer?.phone === phone && s.paymentMode === 'Credit' && !s.isCancelled).reduce((a,s) => a + (Number(s.grandTotal)||0), 0);
        const paid = customerPayments.filter(p => p.customerPhone === phone).reduce((a,p) => a + (Number(p.amount)||0), 0);
        receivable += Math.max(0, credit - paid);
    });
    let payable = 0;
    suppliers.forEach(s => {
        const purchasesTotal = purchases.filter(p => p.supplier === s.name).reduce((a,p) => a + (Number(p.grandTotal || p.total)||0), 0);
        const paid = supplierPayments.filter(p => p.supplierId === s.id).reduce((a,p) => a + (Number(p.amount)||0), 0);
        payable += Math.max(0, purchasesTotal - paid);
    });
    let staffOutstanding = 0;
    staffList.forEach(st => {
        const given = staffAdvances.filter(a => a.staffId === st.id && String(a.type).toLowerCase() !== 'returned').reduce((a,x) => a + (Number(x.amount)||0), 0);
        const returned = staffAdvances.filter(a => a.staffId === st.id && String(a.type).toLowerCase() === 'returned').reduce((a,x) => a + (Number(x.amount)||0), 0);
        staffOutstanding += Math.max(0, given - returned);
    });
    return {receivable, payable, staffOutstanding};
}

function initBalancePage() {
    const d = new Date().toISOString().slice(0,10);
    const dateEl = document.getElementById('bal-date');
    if (dateEl && !dateEl.value) dateEl.value = d;
    loadBalanceDate();
    renderBalanceTransactions();
    renderBalanceBreakdown();
}

function loadBalanceDate() {
    const date = balanceDateValue();
    const record = cashOpenings[date] || {};
    const openEl = document.getElementById('bal-opening');
    const countEl = document.getElementById('bal-counted');
    const noteEl = document.getElementById('bal-closing-note');
    if (openEl) openEl.value = record.opening ?? cashOpenings[date] ?? 0;
    if (countEl) countEl.value = record.counted ?? '';
    if (noteEl) noteEl.value = record.note || '';
    renderBalanceSummary(date);
    renderBalanceBreakdown();
}

function saveBalanceDay() {
    const date = balanceDateValue();
    const opening = Math.max(0, Number(document.getElementById('bal-opening').value) || 0);
    const countedRaw = document.getElementById('bal-counted').value;
    const counted = countedRaw === '' ? null : Math.max(0, Number(countedRaw) || 0);
    const note = (document.getElementById('bal-closing-note').value || '').trim();
    cashOpenings[date] = {opening, counted, note, updatedAt: new Date().toISOString()};
    localStorage.setItem('mediflow_cash_openings', JSON.stringify(cashOpenings));
    if (typeof syncToCloud === 'function') syncToCloud('cash_openings', cashOpenings);
    renderBalanceSummary(date); renderBalanceBreakdown();
    alert('Opening/closing cash saved.');
}

function addBalanceTransaction() {
    const type = document.getElementById('bal-tx-type').value;
    const amount = Number(document.getElementById('bal-tx-amount').value) || 0;
    const note = (document.getElementById('bal-tx-note').value || '').trim();
    if (amount <= 0 || !note) { alert('Enter a valid amount and reason.'); return; }
    cashTransactions.push({id:'CB'+Date.now(), type, amount, note, date: balanceDateValue(), createdAt:new Date().toISOString()});
    localStorage.setItem('mediflow_cash_transactions', JSON.stringify(cashTransactions));
    if (typeof syncToCloud === 'function') syncToCloud('cash_transactions', cashTransactions);
    document.getElementById('bal-tx-amount').value=''; document.getElementById('bal-tx-note').value='';
    renderBalanceTransactions(); renderBalanceSummary(balanceDateValue()); renderBalanceBreakdown();
}

function renderBalanceSummary(date) {
    const b = getBalanceForDate(date);
    const el = document.getElementById('bal-day-summary'); if (!el) return;
    el.innerHTML = `<div><strong>Opening:</strong> ${balanceCurrency(b.opening)} &nbsp; <strong>Cash In:</strong> ${balanceCurrency(b.cashIn)} &nbsp; <strong>Cash Out:</strong> ${balanceCurrency(b.cashOut)}</div><div style="font-size:1.25rem;margin-top:.5rem;"><strong>Expected Closing: ${balanceCurrency(b.expected)}</strong></div>${b.counted === null ? '<div style="margin-top:.4rem;color:var(--text-muted);">Cash counted not entered.</div>' : `<div style="margin-top:.4rem;"><strong>Counted:</strong> ${balanceCurrency(b.counted)} &nbsp; <strong>Difference:</strong> ${balanceCurrency(b.variance)}</div>`}`;
    const pos=getBalancePosition();
    const cards={
      'bal-expected-cash':b.expected,
      'bal-receivable':pos.receivable,
      'bal-payable':pos.payable,
      'bal-staff-advance':pos.staffOutstanding,
      'bal-net-position':b.expected+pos.receivable-pos.payable-pos.staffOutstanding
    };
    Object.entries(cards).forEach(([id,val])=>{const x=document.getElementById(id);if(x)x.textContent=balanceCurrency(val);});
}

function renderBalanceTransactions() {
    const el=document.getElementById('bal-transactions'); if(!el)return;
    const date=balanceDateValue();
    const rows=cashTransactions.filter(t=>String(t.date).slice(0,10)===date).slice().reverse();
    el.innerHTML=rows.length?`<table style="width:100%;font-size:.9rem"><thead><tr><th>Type</th><th>Reason</th><th>Amount</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.type==='in'?'Cash In':'Cash Out'}</td><td>${escapeHtml(t.note||'')}</td><td>${balanceCurrency(t.amount)}</td></tr>`).join('')}</tbody></table>`:'<div style="color:var(--text-muted)">No manual cash entries for this date.</div>';
}

function renderBalanceBreakdown() {
    const el=document.getElementById('bal-breakdown'); if(!el)return;
    const date=balanceDateValue(); const b=getBalanceForDate(date); const pos=getBalancePosition();
    el.innerHTML=`<div class="table-responsive"><table><thead><tr><th>Balance Component</th><th>Amount</th><th>Meaning</th></tr></thead><tbody>
      <tr><td>Opening Cash</td><td>${balanceCurrency(b.opening)}</td><td>Drawer balance at start</td></tr>
      <tr><td>Cash Sales</td><td>${balanceCurrency(b.cashSales)}</td><td>Cash bills</td></tr>
      <tr><td>Customer Payments</td><td>${balanceCurrency(b.customerCashIn)}</td><td>Cash collected against credit</td></tr>
      <tr><td>Manual Cash In</td><td>${balanceCurrency(b.manualIn)}</td><td>Other cash received</td></tr>
      <tr><td>Cash Purchases</td><td>${balanceCurrency(b.cashPurchases)}</td><td>Purchases paid in cash</td></tr>
      <tr><td>Supplier Payments</td><td>${balanceCurrency(b.supplierCashOut)}</td><td>Supplier dues paid in cash</td></tr>
      <tr><td>Expenses</td><td>${balanceCurrency(b.expenseCashOut)}</td><td>Recorded expenses</td></tr>
      <tr><td>Staff Advances</td><td>${balanceCurrency(b.staffCashOut)}</td><td>Cash advances</td></tr>
      <tr><td>Salary Paid</td><td>${balanceCurrency(b.salaryCashOut)}</td><td>Cash salary payments</td></tr>
      <tr><td>Manual Cash Out</td><td>${balanceCurrency(b.manualOut)}</td><td>Other cash paid</td></tr>
      <tr><td><strong>Expected Closing Cash</strong></td><td><strong>${balanceCurrency(b.expected)}</strong></td><td>Opening + In - Out</td></tr>
      <tr><td>Customer Receivable</td><td>${balanceCurrency(pos.receivable)}</td><td>Outstanding customer credit</td></tr>
      <tr><td>Supplier Payable</td><td>${balanceCurrency(pos.payable)}</td><td>Outstanding supplier due</td></tr>
      <tr><td>Staff Advance Outstanding</td><td>${balanceCurrency(pos.staffOutstanding)}</td><td>Unrecovered staff advances</td></tr>
    </tbody></table></div>`;
}

function printBalanceReport() {
    const date=balanceDateValue(); const b=getBalanceForDate(date); const pos=getBalancePosition();
    const w=window.open('','_blank','width=900,height=700');
    if(!w)return;
    w.document.write(`<html><head><title>Balance Report - ${date}</title><style>body{font-family:Arial;padding:30px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}h2{margin-bottom:4px}</style></head><body><h2>${escapeHtml(settings.shopName||'T7 BillPro')} - Balance Report</h2><div>Date: ${date}</div><table><tr><th>Component</th><th>Amount</th></tr><tr><td>Opening Cash</td><td>${balanceCurrency(b.opening)}</td></tr><tr><td>Cash In</td><td>${balanceCurrency(b.cashIn)}</td></tr><tr><td>Cash Out</td><td>${balanceCurrency(b.cashOut)}</td></tr><tr><td>Expected Closing</td><td>${balanceCurrency(b.expected)}</td></tr><tr><td>Customer Receivable</td><td>${balanceCurrency(pos.receivable)}</td></tr><tr><td>Supplier Payable</td><td>${balanceCurrency(pos.payable)}</td></tr><tr><td>Staff Advance Outstanding</td><td>${balanceCurrency(pos.staffOutstanding)}</td></tr>${b.counted!==null?`<tr><td>Counted Cash</td><td>${balanceCurrency(b.counted)}</td></tr><tr><td>Difference</td><td>${balanceCurrency(b.variance)}</td></tr>`:''}</table><script>window.print()</script></body></html>`); w.document.close();
}
// ==================== END BALANCE / CASH MANAGEMENT ====================

function generateReport() {
    const reportType = document.getElementById('report-type')?.value || 'stock';
    const startDateVal = document.getElementById('report-start')?.value;
    const endDateVal = document.getElementById('report-end')?.value;

    const tableTitle = document.getElementById('report-table-title');
    const tableHead = document.getElementById('report-table-head');
    const tableBody = document.querySelector('#report-table tbody');

    if (!tableHead || !tableBody) return;

    let filteredSales = [...(sales || [])];
    if (startDateVal) {
        filteredSales = filteredSales.filter(s => s.date && new Date(s.date) >= new Date(startDateVal));
    }
    if (endDateVal) {
        const end = new Date(endDateVal);
        end.setHours(23, 59, 59, 999);
        filteredSales = filteredSales.filter(s => s.date && new Date(s.date) <= end);
    }

    if (reportType === 'waiter_sales' || reportType === 'waiter-sales') {
        if (tableTitle) tableTitle.textContent = 'Waiter-wise Sales Report';
        
        const waiterMap = {};
        filteredSales.forEach(sale => {
            const waiter = sale.waiterName || 'Unassigned / Counter';
            if (!waiterMap[waiter]) {
                waiterMap[waiter] = { waiterName: waiter, ordersCount: 0, itemsCount: 0, totalRevenue: 0 };
            }
            waiterMap[waiter].ordersCount += 1;
            waiterMap[waiter].itemsCount += (sale.items ? sale.items.reduce((sum, i) => sum + Math.abs(i.qty || 1), 0) : 0);
            waiterMap[waiter].totalRevenue += Number(sale.grandTotal || 0);
        });

        tableHead.innerHTML = `
            <tr>
                <th>Waiter / Staff Name</th>
                <th style="text-align: center;">Total Bills</th>
                <th style="text-align: center;">Total Items Sold</th>
                <th style="text-align: right;">Total Revenue (${settings.currency || '₹'})</th>
            </tr>
        `;

        const summaryList = Object.values(waiterMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
        if (summaryList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">No waiter sales recorded in selected date range.</td></tr>`;
        } else {
            let grandOrders = 0, grandItems = 0, grandRev = 0;
            tableBody.innerHTML = summaryList.map(w => {
                grandOrders += w.ordersCount;
                grandItems += w.itemsCount;
                grandRev += w.totalRevenue;
                return `
                    <tr>
                        <td><strong>${escapeHtml(w.waiterName)}</strong></td>
                        <td style="text-align: center;">${w.ordersCount}</td>
                        <td style="text-align: center;">${w.itemsCount}</td>
                        <td style="text-align: right; font-weight: bold; color: var(--success-color);">${settings.currency || '₹'}${w.totalRevenue.toFixed(2)}</td>
                    </tr>
                `;
            }).join('') + `
                <tr style="background: var(--primary-light); font-weight: bold;">
                    <td>TOTAL OVERALL SUMMARY</td>
                    <td style="text-align: center;">${grandOrders}</td>
                    <td style="text-align: center;">${grandItems}</td>
                    <td style="text-align: right; color: var(--primary-color);">${settings.currency || '₹'}${grandRev.toFixed(2)}</td>
                </tr>
            `;
        }
        return;
    }

    if (reportType === 'doctor_sales' || reportType === 'doctor-sales') {
        if (tableTitle) tableTitle.textContent = 'Doctor-wise Sales Report';

        const doctorMap = {};
        filteredSales.forEach(sale => {
            const doctor = sale.doctorName || 'Self / Direct Sale';
            if (!doctorMap[doctor]) {
                doctorMap[doctor] = { doctorName: doctor, prescriptionCount: 0, totalRevenue: 0 };
            }
            doctorMap[doctor].prescriptionCount += 1;
            doctorMap[doctor].totalRevenue += Number(sale.grandTotal || 0);
        });

        tableHead.innerHTML = `
            <tr>
                <th>Doctor / Prescriber Name</th>
                <th style="text-align: center;">Prescription Bills</th>
                <th style="text-align: right;">Total Sales Revenue (${settings.currency || '₹'})</th>
            </tr>
        `;

        const summaryList = Object.values(doctorMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
        if (summaryList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px;">No doctor sales recorded in selected date range.</td></tr>`;
        } else {
            let grandRx = 0, grandRev = 0;
            tableBody.innerHTML = summaryList.map(d => {
                grandRx += d.prescriptionCount;
                grandRev += d.totalRevenue;
                return `
                    <tr>
                        <td><strong>${escapeHtml(d.doctorName)}</strong></td>
                        <td style="text-align: center;">${d.prescriptionCount}</td>
                        <td style="text-align: right; font-weight: bold; color: var(--success-color);">${settings.currency || '₹'}${d.totalRevenue.toFixed(2)}</td>
                    </tr>
                `;
            }).join('') + `
                <tr style="background: var(--primary-light); font-weight: bold;">
                    <td>TOTAL OVERALL SUMMARY</td>
                    <td style="text-align: center;">${grandRx}</td>
                    <td style="text-align: right; color: var(--primary-color);">${settings.currency || '₹'}${grandRev.toFixed(2)}</td>
                </tr>
            `;
        }
        return;
    }

    if (reportType === 'table_sales' || reportType === 'table-sales') {
        if (tableTitle) tableTitle.textContent = 'Table-wise Sales Report';

        const tableMap = {};
        filteredSales.filter(s => !s.isReturn).forEach(sale => {
            const tbl = sale.tableName || 'Takeaway / Counter';
            if (!tableMap[tbl]) {
                tableMap[tbl] = { tableName: tbl, billsCount: 0, itemsCount: 0, totalRevenue: 0 };
            }
            tableMap[tbl].billsCount += 1;
            tableMap[tbl].itemsCount += (sale.items ? sale.items.reduce((sum, i) => sum + Math.abs(i.qty || 1), 0) : 0);
            tableMap[tbl].totalRevenue += Number(sale.grandTotal || 0);
        });

        tableHead.innerHTML = `
            <tr>
                <th>Table / Zone</th>
                <th style="text-align: center;">Total Bills</th>
                <th style="text-align: center;">Total Items Sold</th>
                <th style="text-align: right;">Total Revenue (${settings.currency || '₹'})</th>
            </tr>
        `;

        const summaryList = Object.values(tableMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
        if (summaryList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">No table sales recorded in selected date range. Enable Table Management in Settings to start tracking.</td></tr>`;
        } else {
            let grandBills = 0, grandItems = 0, grandRev = 0;
            tableBody.innerHTML = summaryList.map(t => {
                grandBills += t.billsCount;
                grandItems += t.itemsCount;
                grandRev += t.totalRevenue;
                return `
                    <tr>
                        <td><strong>${escapeHtml(t.tableName)}</strong></td>
                        <td style="text-align: center;">${t.billsCount}</td>
                        <td style="text-align: center;">${t.itemsCount}</td>
                        <td style="text-align: right; font-weight: bold; color: var(--success-color);">${settings.currency || '₹'}${t.totalRevenue.toFixed(2)}</td>
                    </tr>
                `;
            }).join('') + `
                <tr style="background: var(--primary-light); font-weight: bold;">
                    <td>TOTAL OVERALL SUMMARY</td>
                    <td style="text-align: center;">${grandBills}</td>
                    <td style="text-align: center;">${grandItems}</td>
                    <td style="text-align: right; color: var(--primary-color);">${settings.currency || '₹'}${grandRev.toFixed(2)}</td>
                </tr>
            `;
        }
        return;
    }

    if (reportType === 'stock') {
        if (tableTitle) tableTitle.textContent = 'Stock Report';
        tableHead.innerHTML = `
            <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Stock Qty</th>
                <th>MRP</th>
                <th>Sale Price</th>
            </tr>
        `;
        tableBody.innerHTML = (products || []).map(p => `
            <tr>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${escapeHtml(p.category || 'General')}</td>
                <td>${escapeHtml(p.batch || '---')}</td>
                <td>${escapeHtml(p.expiry || '---')}</td>
                <td>${p.stock || 0}</td>
                <td>${settings.currency || '₹'}${parseFloat(p.mrp || 0).toFixed(2)}</td>
                <td>${settings.currency || '₹'}${parseFloat(p.salePrice || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    } else if (reportType === 'sales_product' || reportType === 'product_sales') {
        if (tableTitle) tableTitle.textContent = 'Sales Product List (Product-Wise Sales Report)';

        const productSalesMap = {};
        filteredSales.filter(s => !s.isReturn).forEach(sale => {
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const prodKey = item.id || item.name || 'Unknown Product';
                    if (!productSalesMap[prodKey]) {
                        productSalesMap[prodKey] = {
                            id: item.id || '---',
                            name: item.name || 'Unknown Product',
                            category: item.category || 'General',
                            unit: item.unit || item.saleUnit || 'pcs',
                            qty: 0,
                            billsCount: 0,
                            revenue: 0,
                            unitPrice: item.salePrice || item.price || item.mrp || 0
                        };
                    }
                    const itemQty = Number(item.qty || 0);
                    const itemPrice = Number(item.salePrice || item.price || item.mrp || 0);
                    const lineTotal = item.total ? Number(item.total) : (itemQty * itemPrice);
                    productSalesMap[prodKey].qty += itemQty;
                    productSalesMap[prodKey].billsCount += 1;
                    productSalesMap[prodKey].revenue += lineTotal;
                });
            }
        });

        tableHead.innerHTML = `
            <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th style="text-align: center;">Total Qty Sold</th>
                <th style="text-align: center;">Bills Count</th>
                <th style="text-align: right;">Unit Price (${settings.currency || '₹'})</th>
                <th style="text-align: right;">Total Sales Revenue (${settings.currency || '₹'})</th>
            </tr>
        `;

        const summaryList = Object.values(productSalesMap).sort((a, b) => b.revenue - a.revenue);
        if (summaryList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No sales products recorded in selected date range.</td></tr>`;
        } else {
            let totalQtySum = 0, totalRevenueSum = 0;
            tableBody.innerHTML = summaryList.map(p => {
                totalQtySum += p.qty;
                totalRevenueSum += p.revenue;
                return `
                    <tr>
                        <td><strong>${escapeHtml(p.name)}</strong></td>
                        <td>${escapeHtml(p.category)}</td>
                        <td style="text-align: center;">${p.qty} ${escapeHtml(p.unit)}</td>
                        <td style="text-align: center;">${p.billsCount}</td>
                        <td style="text-align: right;">${settings.currency || '₹'}${Number(p.unitPrice).toFixed(2)}</td>
                        <td style="text-align: right; font-weight: bold; color: var(--success-color);">${settings.currency || '₹'}${p.revenue.toFixed(2)}</td>
                    </tr>
                `;
            }).join('') + `
                <tr style="background: var(--primary-light); font-weight: bold;">
                    <td colspan="2">TOTAL SALES PRODUCT SUMMARY (${summaryList.length} Unique Products)</td>
                    <td style="text-align: center;">${totalQtySum}</td>
                    <td style="text-align: center;">---</td>
                    <td></td>
                    <td style="text-align: right; color: var(--primary-color);">${settings.currency || '₹'}${totalRevenueSum.toFixed(2)}</td>
                </tr>
            `;
        }
    } else if (reportType.startsWith('sales_')) {
        const mode = reportType.replace('sales_', '');
        let targetSales = filteredSales;
        if (mode === 'cash') targetSales = filteredSales.filter(s => (s.paymentMode || 'Cash') === 'Cash');
        if (mode === 'gpay') targetSales = filteredSales.filter(s => (s.paymentMode || '').toLowerCase().includes('gpay') || (s.paymentMode || '').toLowerCase().includes('upi'));
        if (mode === 'credit') targetSales = filteredSales.filter(s => s.paymentMode === 'Credit');

        if (tableTitle) tableTitle.textContent = `${mode.toUpperCase()} Sales Report`;
        tableHead.innerHTML = `
            <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer Name</th>
                <th>Phone</th>
                <th>Products / Items Sold</th>
                <th>Payment Mode</th>
                <th style="text-align: right;">Amount (${settings.currency || '₹'})</th>
            </tr>
        `;
        let totalAmt = 0;
        tableBody.innerHTML = targetSales.map(s => {
            const amt = Number(s.grandTotal || 0);
            totalAmt += amt;
            const itemsSummary = (s.items && s.items.length > 0)
                ? s.items.map(i => `${escapeHtml(i.name || 'Item')} (x${i.qty || 1})`).join(', ')
                : '---';
            return `
                <tr>
                    <td>#${escapeHtml(s.invoiceNo || '---')}</td>
                    <td>${s.date ? new Date(s.date).toLocaleString() : '---'}</td>
                    <td>${escapeHtml(s.customer ? s.customer.name : 'Cash Customer')}</td>
                    <td>${escapeHtml(s.customer ? s.customer.phone : '---')}</td>
                    <td style="max-width: 250px; font-size: 0.9em; line-height: 1.3;">${itemsSummary}</td>
                    <td><span class="badge">${s.paymentMode || 'Cash'}</span></td>
                    <td style="text-align: right; font-weight: bold;">${settings.currency || '₹'}${amt.toFixed(2)}</td>
                </tr>
            `;
        }).join('') + `
            <tr style="background: var(--primary-light); font-weight: bold;">
                <td colspan="6">TOTAL SALES AMOUNT</td>
                <td style="text-align: right; color: var(--primary-color);">${settings.currency || '₹'}${totalAmt.toFixed(2)}</td>
            </tr>
        `;
    } else if (reportType === 'purchases') {
        if (tableTitle) tableTitle.textContent = 'Purchases Report';
        tableHead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Product Name</th>
                <th>Supplier</th>
                <th>Invoice</th>
                <th>Qty</th>
                <th style="text-align: right;">Total (${settings.currency || '₹'})</th>
            </tr>
        `;
        tableBody.innerHTML = (purchases || []).map(p => `
            <tr>
                <td>${p.date || '---'}</td>
                <td>${escapeHtml(p.productName || '---')}</td>
                <td>${escapeHtml(p.supplier || '---')}</td>
                <td>${escapeHtml(p.invoice || '---')}</td>
                <td>${p.qty || 0}</td>
                <td style="text-align: right;">${settings.currency || '₹'}${parseFloat(p.total || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    } else if (reportType === 'expenses') {
        if (tableTitle) tableTitle.textContent = 'Expenses Report';
        tableHead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th style="text-align: right;">Amount (${settings.currency || '₹'})</th>
            </tr>
        `;
        tableBody.innerHTML = (expenses || []).map(e => `
            <tr>
                <td>${e.date || '---'}</td>
                <td>${escapeHtml(e.category || '---')}</td>
                <td>${escapeHtml(e.description || '---')}</td>
                <td style="text-align: right;">${settings.currency || '₹'}${parseFloat(e.amount || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    }
}

function exportReportToCSV() {
    const table = document.getElementById('report-table');
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('th, td');
        const rowData = [];
        cols.forEach(col => rowData.push('"' + col.innerText.replace(/"/g, '""') + '"'));
        csv.push(rowData.join(','));
    });

    const reportType = document.getElementById('report-type')?.value || 'report';
    downloadBlob(csv.join('\n'), `Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

window.renderBillingWaiterOptions = renderBillingWaiterOptions;
window.renderBillingDoctorOptions = renderBillingDoctorOptions;
window.generateReport = generateReport;
window.exportReportToCSV = exportReportToCSV;

// --- Super Admin Branch Settings Permissions Module ---

let branchSettingsPermissions = JSON.parse(localStorage.getItem('mediflow_branch_settings_permissions')) || {};

function getDefaultBranchPermissions() {
    return {
        editShop: true,
        editPrinter: true,
        editGst: true,
        editKot: true,
        editTableMgmt: true,
        editWaiter: true,
        editDoctor: true,
        editMenuCard: true,
        editDigitalOrders: true,
        manageCategories: true,
        manageExpCategories: true
    };
}

function getBranchPermissions(branchId) {
    const targetBranch = branchId || currentBranchId || 'main';
    return branchSettingsPermissions[targetBranch] || getDefaultBranchPermissions();
}

function renderSuperAdminSettingsPermissions() {
    const permPanel = document.getElementById('super-admin-settings-permissions');
    if (!permPanel) return;

    const loggedInUser = sessionStorage.getItem('mediflow_user');
    const isSuperAdmin = !loggedInUser || loggedInUser === 'VIKI' || (loggedInUser && loggedInUser.toLowerCase() === 'viki');

    if (!isSuperAdmin) {
        permPanel.style.display = 'none';
        return;
    }

    permPanel.style.display = 'block';

    const branchSelect = document.getElementById('perm-target-branch');
    if (branchSelect) {
        const currentVal = branchSelect.value;
        branchSelect.innerHTML = '';
        (branches || []).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `${b.name} (${b.id})`;
            if (b.id === currentVal) opt.selected = true;
            branchSelect.appendChild(opt);
        });

        if (!branchSelect.value && branches && branches.length > 0) {
            branchSelect.value = branches[0].id;
        }
    }

    onPermBranchSelectChange();
}

function onPermBranchSelectChange() {
    const branchSelect = document.getElementById('perm-target-branch');
    if (!branchSelect) return;

    const branchId = branchSelect.value || currentBranchId || 'main';
    const perms = getBranchPermissions(branchId);

    if (document.getElementById('perm-edit-shop')) document.getElementById('perm-edit-shop').checked = perms.editShop !== false;
    if (document.getElementById('perm-edit-printer')) document.getElementById('perm-edit-printer').checked = perms.editPrinter !== false;
    if (document.getElementById('perm-edit-gst')) document.getElementById('perm-edit-gst').checked = (perms.editGst !== undefined ? perms.editGst : perms.editGstKot) !== false;
    if (document.getElementById('perm-edit-kot')) document.getElementById('perm-edit-kot').checked = (perms.editKot !== undefined ? perms.editKot : perms.editGstKot) !== false;
    if (document.getElementById('perm-edit-table-mgmt')) document.getElementById('perm-edit-table-mgmt').checked = perms.editTableMgmt !== false;
    if (document.getElementById('perm-edit-waiter')) document.getElementById('perm-edit-waiter').checked = (perms.editWaiter !== undefined ? perms.editWaiter : perms.editWaiterDoctor) !== false;
    if (document.getElementById('perm-edit-doctor')) document.getElementById('perm-edit-doctor').checked = (perms.editDoctor !== undefined ? perms.editDoctor : perms.editWaiterDoctor) !== false;
    if (document.getElementById('perm-edit-menu-card')) document.getElementById('perm-edit-menu-card').checked = perms.editMenuCard !== false;
    if (document.getElementById('perm-edit-digital-orders')) document.getElementById('perm-edit-digital-orders').checked = perms.editDigitalOrders !== false;
    if (document.getElementById('perm-manage-categories')) document.getElementById('perm-manage-categories').checked = perms.manageCategories !== false;
    if (document.getElementById('perm-manage-exp-categories')) document.getElementById('perm-manage-exp-categories').checked = perms.manageExpCategories !== false;
}

function saveBranchSettingsPermissions() {
    const branchSelect = document.getElementById('perm-target-branch');
    if (!branchSelect) return;

    const branchId = branchSelect.value;
    if (!branchId) return;

    branchSettingsPermissions[branchId] = {
        editShop: document.getElementById('perm-edit-shop')?.checked !== false,
        editPrinter: document.getElementById('perm-edit-printer')?.checked !== false,
        editGst: document.getElementById('perm-edit-gst')?.checked !== false,
        editKot: document.getElementById('perm-edit-kot')?.checked !== false,
        editTableMgmt: document.getElementById('perm-edit-table-mgmt')?.checked !== false,
        editWaiter: document.getElementById('perm-edit-waiter')?.checked !== false,
        editDoctor: document.getElementById('perm-edit-doctor')?.checked !== false,
        editMenuCard: document.getElementById('perm-edit-menu-card')?.checked !== false,
        editDigitalOrders: document.getElementById('perm-edit-digital-orders')?.checked !== false,
        manageCategories: document.getElementById('perm-manage-categories')?.checked !== false,
        manageExpCategories: document.getElementById('perm-manage-exp-categories')?.checked !== false
    };

    localStorage.setItem('mediflow_branch_settings_permissions', JSON.stringify(branchSettingsPermissions));
    syncToCloud('branch_settings_permissions', branchSettingsPermissions);

    alert(`Application Settings Permissions saved for Branch (${branchId}) successfully!`);
    applyBranchSettingsPermissions();
}

function applyBranchSettingsPermissions() {
    const loggedInUser = sessionStorage.getItem('mediflow_user');
    const userRole = sessionStorage.getItem('mediflow_user_role') || sessionStorage.getItem('mediflow_logged_in_role');
    const isSuperAdmin = !loggedInUser || loggedInUser === 'VIKI' || (loggedInUser && loggedInUser.toLowerCase() === 'viki') || userRole === 'super_admin' || userRole === 'Super Admin';

    const systemToggles = [
        'set-gst-default',
        'set-kot-enabled',
        'set-enable-table-mgmt',
        'set-enable-table-qr',
        'set-enable-waiter',
        'set-enable-doctor',
        'set-enable-menu-card',
        'set-enable-digital-orders',
        'set-enable-custom-cake-orders'
    ];

    if (isSuperAdmin) {
        const inputs = document.querySelectorAll('#settings-form input, #settings-form select, #settings-form button');
        inputs.forEach(el => el.disabled = false);
        systemToggles.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = false;
                el.title = "Super Admin: Enable or Disable Feature";
            }
        });
        return;
    }

    const perms = getBranchPermissions(currentBranchId);

    // Shop Details
    ['set-shop-name', 'set-shop-address', 'set-shop-phone', 'set-shop-gstin', 'set-shop-logo', 'set-shop-upi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !perms.editShop;
    });

    // Printer Details
    ['set-printer-type', 'set-printer-name', 'set-print-copies'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !perms.editPrinter;
    });

    // SYSTEM FEATURE TOGGLES: Strictly Restricted to Super Admin ONLY
    systemToggles.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = true;
            el.title = "Only Super Admin can change system feature settings";
        }
    });

    // Nav Item Visibility according to active settings
    const navDoctorMgmt = document.getElementById('nav-doctor-mgmt');
    if (navDoctorMgmt) {
        navDoctorMgmt.style.display = (settings.enableDoctorSelect !== false) ? 'flex' : 'none';
    }

    const navMenuCard = document.querySelector('.nav-item[data-section="menu-card"]');
    if (navMenuCard) {
        navMenuCard.style.display = (settings.enableMenuCard !== false) ? 'flex' : 'none';
    }

    const navDigitalOrders = document.querySelector('.nav-item[data-section="digital-orders"]');
    if (navDigitalOrders) {
        navDigitalOrders.style.display = (settings.enableDigitalOrders !== false) ? 'flex' : 'none';
    }

    const navTableMgmt = document.getElementById('nav-table-mgmt');
    if (navTableMgmt) {
        navTableMgmt.style.display = (settings.enableTableMgmt !== false) ? 'flex' : 'none';
    }

    // Categories
    const newCatInput = document.getElementById('new-category-name');
    if (newCatInput) newCatInput.disabled = !perms.manageCategories;
    const newExpCatInput = document.getElementById('new-exp-category-name');
    if (newExpCatInput) newExpCatInput.disabled = !perms.manageExpCategories;
}

window.renderSuperAdminSettingsPermissions = renderSuperAdminSettingsPermissions;
window.onPermBranchSelectChange = onPermBranchSelectChange;
window.saveBranchSettingsPermissions = saveBranchSettingsPermissions;
window.applyBranchSettingsPermissions = applyBranchSettingsPermissions;
window.onAMCBranchSelectChange = onAMCBranchSelectChange;
window.toggleBranchLockStatus = toggleBranchLockStatus;
window.getBranchAMC = getBranchAMC;

// --- Return Bill Engine ---

let activeReturnTargetSale = null;

function openReturnBillModal(invNo) {
    const modal = document.getElementById('return-bill-modal');
    if (!modal) return;

    activeReturnTargetSale = null;
    const input = document.getElementById('return-bill-id-input');
    const detailsContainer = document.getElementById('return-bill-details-container');

    if (detailsContainer) detailsContainer.style.display = 'none';

    if (input) {
        input.value = invNo || '';
    }

    modal.style.display = 'flex';

    if (invNo) {
        lookupReturnBill();
    }
}

function closeReturnBillModal() {
    const modal = document.getElementById('return-bill-modal');
    if (modal) modal.style.display = 'none';
    activeReturnTargetSale = null;
}

function lookupReturnBill() {
    const input = document.getElementById('return-bill-id-input');
    if (!input) return;

    const query = input.value.trim().toLowerCase();
    if (!query) {
        alert('Please enter a Bill ID or Invoice Number.');
        return;
    }

    const cleanQuery = query.replace(/[^a-z0-9]/g, '');
    const foundSale = (sales || []).find(s => {
        if (!s) return false;
        const inv = (s.invoiceNo || '').toLowerCase();
        const cleanInv = inv.replace(/[^a-z0-9]/g, '');
        const id = (s.id || '').toLowerCase();
        return inv === query || (cleanQuery && cleanInv === cleanQuery) || (cleanQuery && cleanInv.includes(cleanQuery)) || id === query;
    });

    if (!foundSale) {
        alert(`No bill found matching Invoice ID "${input.value}". Please check the Invoice Number.`);
        return;
    }

    if (foundSale.isReturn) {
        alert(`Bill #${foundSale.invoiceNo} is already a Return Invoice.`);
        return;
    }

    activeReturnTargetSale = foundSale;

    document.getElementById('return-bill-inv-no').textContent = foundSale.invoiceNo || foundSale.id;
    document.getElementById('return-bill-customer').textContent = foundSale.customer ? foundSale.customer.name : 'Cash Customer';
    document.getElementById('return-bill-date').textContent = foundSale.date ? new Date(foundSale.date).toLocaleDateString() : '---';
    document.getElementById('return-bill-orig-total').textContent = `${settings.currency || '₹'}${Number(foundSale.grandTotal || 0).toFixed(2)}`;

    const tbody = document.getElementById('return-items-tbody');
    tbody.innerHTML = '';

    (foundSale.items || []).forEach((item, index) => {
        const tr = document.createElement('tr');
        const unitPrice = Number(item.salePrice || item.mrp || item.price || 0);
        const soldQty = Math.abs(item.quantity || item.qty || 1);

        tr.innerHTML = `
            <td><strong>${escapeHtml(item.name || item.productName || 'Item')}</strong></td>
            <td style="text-align: center;">${settings.currency || '₹'}${unitPrice.toFixed(2)}</td>
            <td style="text-align: center;"><strong>${soldQty}</strong></td>
            <td style="text-align: center;">
                <input type="number" class="form-control return-qty-input" data-index="${index}" data-price="${unitPrice}" data-max="${soldQty}" value="${soldQty}" min="0" max="${soldQty}" style="width: 80px; text-align: center; margin: 0 auto;" oninput="updateReturnTotals()">
            </td>
            <td style="text-align: right; font-weight: bold; color: var(--danger-color);" class="return-item-subtotal">${settings.currency || '₹'}${(unitPrice * soldQty).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('return-bill-details-container').style.display = 'block';
    updateReturnTotals();
}

function updateReturnTotals() {
    const inputs = document.querySelectorAll('.return-qty-input');
    let grandRefund = 0;

    inputs.forEach(input => {
        const qty = parseFloat(input.value) || 0;
        const max = parseFloat(input.getAttribute('data-max')) || 0;
        const price = parseFloat(input.getAttribute('data-price')) || 0;

        if (qty > max) {
            input.value = max;
        }

        const validQty = Math.min(Math.max(0, qty), max);
        const itemSubtotal = validQty * price;
        grandRefund += itemSubtotal;

        const row = input.closest('tr');
        if (row) {
            const subtotalEl = row.querySelector('.return-item-subtotal');
            if (subtotalEl) subtotalEl.textContent = `${settings.currency || '₹'}${itemSubtotal.toFixed(2)}`;
        }
    });

    const refundText = document.getElementById('return-total-refund-text');
    if (refundText) refundText.textContent = `${settings.currency || '₹'}${grandRefund.toFixed(2)}`;
}

function confirmProcessReturnBill() {
    if (!activeReturnTargetSale) {
        alert('No active bill selected to return.');
        return;
    }

    const inputs = document.querySelectorAll('.return-qty-input');
    const returnItems = [];
    let totalRefundAmount = 0;

    inputs.forEach(input => {
        const index = parseInt(input.getAttribute('data-index'));
        const returnQty = parseFloat(input.value) || 0;
        const price = parseFloat(input.getAttribute('data-price')) || 0;
        const originalItem = activeReturnTargetSale.items[index];

        if (returnQty > 0 && originalItem) {
            const subtotal = returnQty * price;
            totalRefundAmount += subtotal;

            returnItems.push({
                ...originalItem,
                quantity: returnQty,
                qty: returnQty,
                price: price,
                salePrice: price,
                total: subtotal
            });

            // Restock items in products array
            const prodIndex = (products || []).findIndex(p => p.id === originalItem.id || p.name === originalItem.name);
            if (prodIndex > -1) {
                products[prodIndex].stock = Number(products[prodIndex].stock || 0) + returnQty;
            }
        }
    });

    if (returnItems.length === 0 || totalRefundAmount <= 0) {
        alert('Please specify at least 1 item return quantity greater than 0.');
        return;
    }

    const returnInvoiceNo = `RET-${activeReturnTargetSale.invoiceNo || Date.now()}`;
    const returnSaleData = {
        id: 'SALE_RET_' + Date.now(),
        invoiceNo: returnInvoiceNo,
        date: new Date().toISOString(),
        customer: activeReturnTargetSale.customer || { name: 'Cash Customer' },
        items: returnItems,
        subtotal: -totalRefundAmount,
        gst: 0,
        discount: 0,
        grandTotal: -totalRefundAmount,
        paymentMode: activeReturnTargetSale.paymentMode || 'Cash',
        isReturn: true,
        refInvoiceNo: activeReturnTargetSale.invoiceNo,
        waiterName: activeReturnTargetSale.waiterName || '',
        doctorName: activeReturnTargetSale.doctorName || ''
    };

    sales.unshift(returnSaleData);

    localStorage.setItem('mediflow_products', JSON.stringify(products));
    localStorage.setItem('mediflow_sales', JSON.stringify(sales));
    syncToCloud('products', products);
    syncToCloud('sales', sales);

    alert(`Return Bill #${returnInvoiceNo} processed successfully! Refund Amount: ${settings.currency || '₹'}${totalRefundAmount.toFixed(2)}`);

    closeReturnBillModal();
    renderSalesHistory();
    renderDashboard();
    if (activeSection === 'products') renderProducts();

    // Print Return Bill Receipt
    printBill(returnSaleData);
}

function toggleReturnMode() {
    openReturnBillModal();
    const input = document.getElementById('return-bill-id-input');
    if (input) {
        setTimeout(() => {
            input.focus();
            input.select();
        }, 150);
    }
}

window.toggleReturnMode = toggleReturnMode;
window.openReturnBillModal = openReturnBillModal;
window.closeReturnBillModal = closeReturnBillModal;
window.lookupReturnBill = lookupReturnBill;
window.updateReturnTotals = updateReturnTotals;
window.confirmProcessReturnBill = confirmProcessReturnBill;

// --- Table Management Engine ---

let tableList = [];

function loadTableList() {
    try {
        tableList = JSON.parse(localStorage.getItem('mediflow_tables')) || [];
    } catch (e) {
        tableList = [];
    }
    // Seed default tables if empty and table mgmt is enabled
    if (tableList.length === 0 && settings.enableTableMgmt) {
        tableList = [
            { id: 'TBL1', name: 'Table 1', capacity: 4, zone: 'General', status: 'Available' },
            { id: 'TBL2', name: 'Table 2', capacity: 4, zone: 'General', status: 'Available' },
            { id: 'TBL3', name: 'Table 3', capacity: 4, zone: 'General', status: 'Available' },
            { id: 'TBL4', name: 'Table 4', capacity: 6, zone: 'General', status: 'Available' },
            { id: 'TBL5', name: 'Table 5', capacity: 2, zone: 'General', status: 'Available' },
            { id: 'AC1',  name: 'AC Table 1', capacity: 4, zone: 'AC Section', status: 'Available' },
            { id: 'AC2',  name: 'AC Table 2', capacity: 4, zone: 'AC Section', status: 'Available' },
            { id: 'TKW',  name: 'Takeaway / Parcel', capacity: 0, zone: 'Takeaway', status: 'Available' }
        ];
        localStorage.setItem('mediflow_tables', JSON.stringify(tableList));
    }
}

function saveTableList() {
    localStorage.setItem('mediflow_tables', JSON.stringify(tableList));
    syncToCloud('tables', tableList);
}

function renderTableManagement() {
    loadTableList();

    // Show/hide nav item based on setting
    const navBtn = document.getElementById('nav-table-mgmt');
    if (navBtn) navBtn.style.display = settings.enableTableMgmt ? 'flex' : 'none';

    // Update billing table dropdown with custom table list
    const billingSelect = document.getElementById('billing-table-select');
    if (billingSelect && tableList.length > 0) {
        billingSelect.innerHTML = '<option value="">Select Table (Optional)</option>';
        tableList.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = `${t.name} (${t.zone || 'General'}, ${t.capacity > 0 ? t.capacity + ' seats' : 'Takeaway'})`;
            billingSelect.appendChild(opt);
        });
    }

    const grid = document.getElementById('table-status-grid');
    if (!grid) return;

    if (tableList.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="layout-grid" style="width: 48px; height: 48px; margin: 0 auto 1rem; display: block; opacity: 0.4;"></i>
                <p>No tables added yet. Click <strong>Add Table</strong> to create your first dining table.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }
    const showQrOption = settings.enableTableQr !== false;

    const today = new Date().toDateString();
    const todaySales = (sales || []).filter(s => s.tableName && new Date(s.date).toDateString() === today && !s.isReturn);

    grid.innerHTML = tableList.map((t, idx) => {
        const tableSales = todaySales.filter(s => s.tableName === t.name);
        const todayRevenue = tableSales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
        const statusColor = t.status === 'Occupied' ? '#dc2626' : t.status === 'Reserved' ? '#d97706' : '#16a34a';
        const statusBg = t.status === 'Occupied' ? '#fee2e2' : t.status === 'Reserved' ? '#fef3c7' : '#dcfce7';

        return `
            <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <strong style="font-size: 1rem; color: var(--text-main);">${escapeHtml(t.name)}</strong>
                    <span style="font-size: 0.75rem; font-weight: 600; background: ${statusBg}; color: ${statusColor}; padding: 2px 8px; border-radius: 20px;">${t.status || 'Available'}</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                    <i data-lucide="tag" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${escapeHtml(t.zone || 'General')}
                    ${t.capacity > 0 ? `&nbsp; <i data-lucide="users" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${t.capacity} seats` : ''}
                </div>
                <div style="font-size: 0.85rem; color: var(--success-color); font-weight: 600; margin-top: 4px;">
                    Today: ${settings.currency || '₹'}${todayRevenue.toFixed(2)} (${tableSales.length} bills)
                </div>
                <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
                    <button class="btn btn-outline" onclick="setTableStatus(${idx}, 'Available')" style="padding: 3px 8px; font-size: 0.78rem; color: #16a34a; border-color: #16a34a;" title="Mark Available">✓ Free</button>
                    <button class="btn btn-outline" onclick="setTableStatus(${idx}, 'Occupied')" style="padding: 3px 8px; font-size: 0.78rem; color: #dc2626; border-color: #dc2626;" title="Mark Occupied">🪑 Occupied</button>
                    ${showQrOption ? `<button class="btn btn-outline" onclick="showTableQRCode(${idx})" style="padding: 3px 8px; font-size: 0.78rem; color: #0284c7; border-color: #0284c7;" title="Table QR Code">📱 QR</button>` : ''}
                    <button class="btn btn-outline" onclick="editTableEntry(${idx})" style="padding: 3px 8px; font-size: 0.78rem;" title="Edit"><i data-lucide="edit-2" style="width: 12px;"></i></button>
                    <button class="btn btn-outline" onclick="deleteTableEntry(${idx})" style="padding: 3px 8px; font-size: 0.78rem; color: var(--danger-color);" title="Delete"><i data-lucide="trash-2" style="width: 12px;"></i></button>
                </div>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Render today's revenue summary
    const tbody = document.getElementById('table-revenue-tbody');
    if (tbody) {
        if (todaySales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--text-muted);">No table sales recorded today.</td></tr>';
        } else {
            const tMap = {};
            todaySales.forEach(s => {
                const k = s.tableName || 'Unknown';
                if (!tMap[k]) tMap[k] = { bills: 0, rev: 0 };
                tMap[k].bills++;
                tMap[k].rev += Number(s.grandTotal || 0);
            });
            let grandBills = 0, grandRev = 0;
            tbody.innerHTML = Object.entries(tMap).map(([name, v]) => {
                grandBills += v.bills;
                grandRev += v.rev;
                return `<tr><td><strong>${escapeHtml(name)}</strong></td><td style="text-align: center;">${v.bills}</td><td style="text-align: right; font-weight: bold; color: var(--success-color);">${settings.currency || '₹'}${v.rev.toFixed(2)}</td></tr>`;
            }).join('') + `<tr style="background: var(--primary-light); font-weight: bold;"><td>TOTAL</td><td style="text-align: center;">${grandBills}</td><td style="text-align: right; color: var(--primary-color);">${settings.currency || '₹'}${grandRev.toFixed(2)}</td></tr>`;
        }
    }
}

function setTableStatus(idx, status) {
    if (tableList[idx]) {
        tableList[idx].status = status;
        saveTableList();
        renderTableManagement();
    }
}

function updateTableStatusByRef(tableName, newStatus) {
    if (!tableName) return;
    loadTableList();
    if (!tableList || tableList.length === 0) return;
    const cleanName = String(tableName).trim().toLowerCase();
    const table = tableList.find(t => t.name.toLowerCase() === cleanName || cleanName.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(cleanName));
    if (table) {
        table.status = newStatus;
        saveTableList();
        if (typeof renderTableManagement === 'function') renderTableManagement();
    }
}

function openAddTableModal(idx = null) {
    const modal = document.getElementById('add-table-modal');
    if (!modal) return;
    document.getElementById('table-edit-id').value = idx !== null ? idx : '';
    document.getElementById('table-name-input').value = '';
    document.getElementById('table-capacity-input').value = '4';
    document.getElementById('table-zone-input').value = 'Main Dining';

    if (idx !== null && tableList[idx]) {
        const t = tableList[idx];
        document.getElementById('table-name-input').value = t.name || '';
        document.getElementById('table-capacity-input').value = t.capacity || 4;
        document.getElementById('table-zone-input').value = t.zone || 'Main Dining';
    }
    modal.style.display = 'flex';
}

function closeAddTableModal() {
    const modal = document.getElementById('add-table-modal');
    if (modal) modal.style.display = 'none';
}

function saveTableEntry() {
    const idxStr = document.getElementById('table-edit-id').value;
    const name = document.getElementById('table-name-input').value.trim();
    const capacity = Number(document.getElementById('table-capacity-input').value) || 0;
    const zone = document.getElementById('table-zone-input').value.trim() || 'General';

    if (!name) {
        alert('Please enter a Table Name / Number');
        return;
    }

    if (idxStr !== '' && tableList[idxStr]) {
        tableList[idxStr].name = name;
        tableList[idxStr].capacity = capacity;
        tableList[idxStr].zone = zone;
    } else {
        tableList.push({
            id: 'TBL' + Date.now(),
            name,
            capacity,
            zone,
            status: 'Available',
            branchId: currentBranchId
        });
    }

    saveTableList();
    closeAddTableModal();
    renderTableManagement();
}

function editTableEntry(idx) {
    openAddTableModal(idx);
}

function deleteTableEntry(idx) {
    if (!confirm(`Delete "${tableList[idx]?.name}"? This cannot be undone.`)) return;
    tableList.splice(idx, 1);
    saveTableList();
    renderTableManagement();
}

// --- Table QR Code Functions ---
function getTableMenuURL(tableName, branchId) {
    const targetBranch = branchId || (typeof currentBranchId !== 'undefined' && currentBranchId ? currentBranchId : (sessionStorage.getItem('mediflow_current_branch') || 'branch_default'));
    const list = Array.isArray(tableList) ? tableList : [];
    const table = list.find(t => String(t.name || '').trim().toLowerCase() === String(tableName || '').trim().toLowerCase());
    const tableId = table && table.id ? table.id : '';
    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    return `${baseUrl}#menu-card?branch=${encodeURIComponent(targetBranch)}&tableId=${encodeURIComponent(tableId)}&table=${encodeURIComponent(tableName || '')}`;
}

function showTableQRCode(tableIdx) {
    if (tableIdx === undefined || !tableList[tableIdx]) return;
    const table = tableList[tableIdx];
    const shopName = settings.shopName || 'T7 BillPro';
    const tableUrl = getTableMenuURL(table.name);
    const qrApiUrl = window.generateOfflineQRCode(tableUrl, 250);

    let modal = document.getElementById('table-qr-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'table-qr-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 420px; text-align: center; border-radius: 16px; padding: 2rem; background: var(--card-bg, #ffffff); box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 id="table-qr-title" style="margin: 0; font-size: 1.25rem;">Table QR Code</h3>
                    <button type="button" class="btn-close" onclick="closeTableQRModal()">&times;</button>
                </div>
                <p id="table-qr-subtitle" style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1.2rem;"></p>
                
                <div style="background: #ffffff; padding: 16px; border-radius: 16px; border: 2px dashed #e2e8f0; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin-bottom: 1.2rem;">
                    <img id="table-qr-img" src="" alt="Table QR Code" style="width: 220px; height: 220px; display: block; border-radius: 8px;">
                </div>

                <div style="background: var(--bg-main, #f8fafc); padding: 10px 14px; border-radius: 10px; font-size: 0.8rem; font-family: monospace; color: var(--text-main); word-break: break-all; margin-bottom: 1.2rem; border: 1px solid var(--border-color);" id="table-qr-url-text"></div>

                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="printTableQRStandee()"><i data-lucide="printer"></i> Print Table Standee</button>
                    <button class="btn btn-outline" onclick="copyTableQRLink()"><i data-lucide="copy"></i> Copy Link</button>
                    <button class="btn btn-secondary" onclick="closeTableQRModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    window.currentQRTableIndex = tableIdx;
    document.getElementById('table-qr-title').textContent = `QR Code - ${table.name}`;
    document.getElementById('table-qr-subtitle').textContent = `Table: ${table.name} (${table.zone || 'General'}, ${table.capacity > 0 ? table.capacity + ' seats' : 'Takeaway'})`;
    document.getElementById('table-qr-img').src = qrApiUrl;
    document.getElementById('table-qr-url-text').textContent = tableUrl;

    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '999999';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeTableQRModal() {
    const modal = document.getElementById('table-qr-modal');
    if (modal) modal.style.display = 'none';
}

function copyTableQRLink() {
    if (window.currentQRTableIndex !== undefined && tableList[window.currentQRTableIndex]) {
        const table = tableList[window.currentQRTableIndex];
        const url = getTableMenuURL(table.name);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                alert(`QR Link for ${table.name} copied to clipboard!`);
            }).catch(() => {
                prompt(`Copy Link for ${table.name}:`, url);
            });
        } else {
            prompt(`Copy Link for ${table.name}:`, url);
        }
    }
}

function printTableQRStandee(idx, overrideSize) {
    const targetIdx = idx !== undefined ? idx : window.currentQRTableIndex;
    if (targetIdx === undefined || !tableList[targetIdx]) return;
    const table = tableList[targetIdx];
    const shopName = settings.shopName || 'T7 BillPro';
    const tableUrl = getTableMenuURL(table.name);

    const selectedSize = overrideSize || (document.getElementById('table-qr-paper-size') ? document.getElementById('table-qr-paper-size').value : (settings.printerType || 'a5'));

    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('Please allow popups to print Table QR Code.');
        return;
    }

    if (selectedSize === '3inch' || selectedSize === '4inch') {
        const widthMm = selectedSize === '3inch' ? '76mm' : '96mm';
        const pageMm = selectedSize === '3inch' ? '80mm auto' : '100mm auto';
        const imgPx = selectedSize === '3inch' ? 180 : 220;
        const qrApiUrl = window.generateOfflineQRCode(tableUrl, imgPx);

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Ticket - ${escapeHtml(table.name)} (${selectedSize})</title>
                <style>
                    @media print { @page { size: ${pageMm}; margin: 0; } }
                    body { width: ${widthMm}; margin: 0 auto; padding: 4mm 2mm; font-family: system-ui, -apple-system, sans-serif; text-align: center; background: white; color: black; }
                    .qr-ticket { border: 2px solid #000; border-radius: 12px; padding: 10px 6px; box-sizing: border-box; }
                    h1 { margin: 0 0 4px; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
                    h2 { margin: 6px 0 4px; font-size: 20px; font-weight: 800; background: #000; color: #fff; padding: 4px 12px; border-radius: 6px; display: inline-block; }
                    .subtitle { font-size: 11px; margin-bottom: 6px; color: #333; }
                    .qr-box { padding: 4px; margin: 6px 0; display: inline-block; border: 1px solid #ccc; border-radius: 8px; }
                    .instructions { font-size: 13px; font-weight: 800; margin-top: 6px; text-transform: uppercase; }
                    .steps { font-size: 10px; margin-top: 4px; line-height: 1.3; color: #222; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .powered { font-size: 9px; color: #666; letter-spacing: 0.5px; }
                </style>
            </head>
            <body>
                <div class="qr-ticket">
                    <h1>${escapeHtml(shopName)}</h1>
                    <div class="subtitle">Digital Menu & Table Ordering</div>
                    <div class="divider"></div>
                    <div><h2>🪑 ${escapeHtml(table.name)}</h2></div>
                    <div style="font-size: 11px; font-weight: bold; margin-top: 2px;">Zone: ${escapeHtml(table.zone || 'Dining Area')}</div>
                    <div class="qr-box">
                        <img src="${qrApiUrl}" alt="Table QR Code" style="width: ${imgPx}px; height: ${imgPx}px; display: block; margin: 0 auto;" onload="window.print()">
                    </div>
                    <div class="instructions">📱 SCAN TO ORDER FOOD</div>
                    <div class="steps">1. Open Camera / QR App<br>2. Scan QR code to view menu<br>3. Select items & place order</div>
                    <div class="divider"></div>
                    <div class="powered">Powered by T7 BillPro</div>
                </div>
            </body>
            </html>
        `);
    } else {
        const qrApiUrl = window.generateOfflineQRCode(tableUrl, 300);
        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Standee - ${escapeHtml(table.name)}</title>
                <style>
                    @media print { @page { size: A5 portrait; margin: 10mm; } }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 20px; background: #f8fafc; color: #1e293b; }
                    .standee-card { background: white; border: 3px solid #0284c7; border-radius: 20px; padding: 30px; max-width: 400px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
                    h1 { color: #0284c7; margin: 0 0 5px; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
                    h2 { color: #0f172a; margin: 15px 0 5px; font-size: 28px; background: #e0f2fe; padding: 6px 16px; border-radius: 30px; display: inline-block; }
                    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 20px; }
                    .qr-box { background: #ffffff; padding: 15px; border-radius: 16px; border: 2px solid #e2e8f0; display: inline-block; margin: 15px 0; }
                    .qr-box img { width: 240px; height: 240px; display: block; }
                    .instructions { font-size: 15px; font-weight: 600; color: #334155; margin-top: 15px; }
                    .steps { font-size: 13px; color: #64748b; margin-top: 5px; line-height: 1.5; }
                    .powered { margin-top: 25px; font-size: 11px; color: #94a3b8; letter-spacing: 0.5px; }
                </style>
            </head>
            <body>
                <div class="standee-card">
                    <h1>${escapeHtml(shopName)}</h1>
                    <div class="subtitle">Digital QR Menu & Ordering</div>
                    <div><h2>🪑 ${escapeHtml(table.name)}</h2></div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${escapeHtml(table.zone || 'Dining Area')}</div>
                    <div class="qr-box">
                        <img src="${qrApiUrl}" alt="Table QR Code" onload="window.print()">
                    </div>
                    <div class="instructions">📱 SCAN TO ORDER FOOD</div>
                    <div class="steps">1. Open Camera or QR Scanner<br>2. Scan this QR Code to view menu<br>3. Select items & place order instantly</div>
                    <div class="powered">Powered by T7 BillPro</div>
                </div>
            </body>
            </html>
        `);
    }
    printWin.document.close();
}

function printAllTableQrs(overrideSize) {
    if (!tableList || tableList.length === 0) {
        alert('No tables found to print QR codes.');
        return;
    }
    const shopName = settings.shopName || 'T7 BillPro';
    const selectedSize = overrideSize || (document.getElementById('table-qr-paper-size') ? document.getElementById('table-qr-paper-size').value : (settings.printerType || 'a5'));

    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('Please allow popups to print Table QR Standees.');
        return;
    }

    if (selectedSize === '3inch' || selectedSize === '4inch') {
        const widthMm = selectedSize === '3inch' ? '76mm' : '96mm';
        const pageMm = selectedSize === '3inch' ? '80mm auto' : '100mm auto';
        const imgPx = selectedSize === '3inch' ? 180 : 220;

        const cardsHtml = tableList.map(table => {
            const tableUrl = getTableMenuURL(table.name);
            const qrApiUrl = window.generateOfflineQRCode(tableUrl, imgPx);
            return `
                <div class="qr-ticket" style="page-break-after: always; margin-bottom: 15px;">
                    <h1>${escapeHtml(shopName)}</h1>
                    <div class="subtitle">Digital Menu & Table Ordering</div>
                    <div class="divider"></div>
                    <div><h2>🪑 ${escapeHtml(table.name)}</h2></div>
                    <div style="font-size: 11px; font-weight: bold; margin-top: 2px;">Zone: ${escapeHtml(table.zone || 'Dining Area')}</div>
                    <div class="qr-box">
                        <img src="${qrApiUrl}" alt="Table QR Code" style="width: ${imgPx}px; height: ${imgPx}px; display: block; margin: 0 auto;">
                    </div>
                    <div class="instructions">📱 SCAN TO ORDER FOOD</div>
                    <div class="steps">1. Open Camera / QR App<br>2. Scan QR code to view menu<br>3. Select items & place order</div>
                    <div class="divider"></div>
                    <div class="powered">Powered by T7 BillPro</div>
                </div>
            `;
        }).join('');

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>All Table QR Tickets - ${escapeHtml(shopName)} (${selectedSize})</title>
                <style>
                    @media print { @page { size: ${pageMm}; margin: 0; } }
                    body { width: ${widthMm}; margin: 0 auto; padding: 4mm 2mm; font-family: system-ui, -apple-system, sans-serif; text-align: center; background: white; color: black; }
                    .qr-ticket { border: 2px solid #000; border-radius: 12px; padding: 10px 6px; box-sizing: border-box; }
                    h1 { margin: 0 0 4px; font-size: 16px; font-weight: 800; text-transform: uppercase; }
                    h2 { margin: 6px 0 4px; font-size: 20px; font-weight: 800; background: #000; color: #fff; padding: 4px 12px; border-radius: 6px; display: inline-block; }
                    .subtitle { font-size: 11px; margin-bottom: 6px; color: #333; }
                    .qr-box { padding: 4px; margin: 6px 0; display: inline-block; border: 1px solid #ccc; border-radius: 8px; }
                    .instructions { font-size: 13px; font-weight: 800; margin-top: 6px; text-transform: uppercase; }
                    .steps { font-size: 10px; margin-top: 4px; line-height: 1.3; color: #222; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .powered { font-size: 9px; color: #666; }
                </style>
            </head>
            <body onload="window.print()">
                ${cardsHtml}
            </body>
            </html>
        `);
    } else {
        const cardsHtml = tableList.map(table => {
            const tableUrl = getTableMenuURL(table.name);
            const qrApiUrl = window.generateOfflineQRCode(tableUrl, 250);
            return `
                <div class="standee-card">
                    <h1>${escapeHtml(shopName)}</h1>
                    <div class="subtitle">Digital QR Menu & Ordering</div>
                    <div><h2>🪑 ${escapeHtml(table.name)}</h2></div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${escapeHtml(table.zone || 'Dining Area')}</div>
                    <div class="qr-box">
                        <img src="${qrApiUrl}" alt="Table QR Code">
                    </div>
                    <div class="instructions">📱 SCAN TO ORDER FOOD</div>
                    <div class="steps">1. Open Camera &amp; Scan QR<br>2. Select items &amp; place order</div>
                    <div class="powered">Powered by T7 BillPro</div>
                </div>
            `;
        }).join('');

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>All Table QR Standees - ${escapeHtml(shopName)}</title>
                <style>
                    @media print {
                        @page { size: A4 portrait; margin: 10mm; }
                        .standee-card { page-break-inside: avoid; margin-bottom: 20px; }
                    }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f8fafc; color: #1e293b; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                    .standee-card { background: white; border: 3px solid #0284c7; border-radius: 20px; padding: 20px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
                    h1 { color: #0284c7; margin: 0 0 4px; font-size: 20px; text-transform: uppercase; }
                    h2 { color: #0f172a; margin: 10px 0 4px; font-size: 22px; background: #e0f2fe; padding: 4px 14px; border-radius: 20px; display: inline-block; }
                    .subtitle { color: #64748b; font-size: 12px; }
                    .qr-box { background: #ffffff; padding: 10px; border-radius: 12px; border: 2px solid #e2e8f0; display: inline-block; margin: 10px 0; }
                    .qr-box img { width: 180px; height: 180px; display: block; }
                    .instructions { font-size: 13px; font-weight: 600; color: #334155; }
                    .steps { font-size: 11px; color: #64748b; margin-top: 4px; }
                    .powered { margin-top: 15px; font-size: 10px; color: #94a3b8; }
                </style>
            </head>
            <body onload="window.print()">
                ${cardsHtml}
            </body>
            </html>
        `);
    }
    printWin.document.close();
}

window.renderTableManagement = renderTableManagement;
window.openAddTableModal = openAddTableModal;
window.closeAddTableModal = closeAddTableModal;
window.saveTableEntry = saveTableEntry;
window.editTableEntry = editTableEntry;
window.deleteTableEntry = deleteTableEntry;
window.showTableQRCode = showTableQRCode;
window.closeTableQRModal = closeTableQRModal;
window.copyTableQRLink = copyTableQRLink;
window.printTableQRStandee = printTableQRStandee;
window.printAllTableQrs = printAllTableQrs;

// --- Doctor Management System ---
function renderDoctorManagement() {
    const tbody = document.getElementById('doctor-list-tbody');
    if (!tbody) return;

    if (!doctorsList || doctorsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">No doctor profiles created yet. Click "Add New Doctor" to get started.</td></tr>`;
        return;
    }

    // Calculate prescriptions count and revenue per doctor from sales
    const doctorStatsMap = {};
    (sales || []).forEach(sale => {
        if (sale.doctorName && sale.doctorName.trim()) {
            const dName = sale.doctorName.trim();
            if (!doctorStatsMap[dName]) {
                doctorStatsMap[dName] = { count: 0, revenue: 0 };
            }
            doctorStatsMap[dName].count += 1;
            doctorStatsMap[dName].revenue += Number(sale.grandTotal || 0);
        }
    });

    tbody.innerHTML = doctorsList.map(doc => {
        const stats = doctorStatsMap[doc.name.trim()] || { count: 0, revenue: 0 };
        return `
            <tr>
                <td><strong>${escapeHtml(doc.name)}</strong></td>
                <td>${escapeHtml(doc.specialty || 'General Physician')}</td>
                <td>${escapeHtml(doc.phone || 'N/A')}</td>
                <td>${escapeHtml(doc.clinic || 'N/A')}</td>
                <td style="text-align: center;"><span class="badge" style="background: var(--primary-light); color: var(--primary-color); font-weight: bold;">${stats.count} Bills</span></td>
                <td style="text-align: right; font-weight: bold; color: var(--success-color);">${formatCurrency(stats.revenue)}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 5px; justify-content: flex-end;">
                        <button class="btn btn-outline" onclick="editDoctor('${doc.id}')" style="padding: 4px 8px; color: var(--primary-color);" title="Edit"><i data-lucide="edit-2" style="width: 14px;"></i> Edit</button>
                        <button class="btn btn-outline" onclick="deleteDoctor('${doc.id}')" style="padding: 4px 8px; color: var(--danger-color);" title="Delete"><i data-lucide="trash" style="width: 14px;"></i> Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddDoctorModal() {
    document.getElementById('edit-doc-id').value = '';
    const modalTitle = document.getElementById('doctor-modal-title');
    if (modalTitle) modalTitle.textContent = 'Add Doctor Profile';
    document.getElementById('doc-name-input').value = '';
    document.getElementById('doc-specialty-input').value = '';
    document.getElementById('doc-phone-input').value = '';
    document.getElementById('doc-clinic-input').value = '';
    document.getElementById('doc-commission-input').value = '';
    
    const modal = document.getElementById('doctor-modal');
    if (modal) modal.style.display = 'flex';
}

function closeDoctorModal() {
    const modal = document.getElementById('doctor-modal');
    if (modal) modal.style.display = 'none';
}

function saveDoctor(e) {
    if (e) e.preventDefault();
    const editId = document.getElementById('edit-doc-id').value;
    const name = document.getElementById('doc-name-input').value.trim();
    const specialty = document.getElementById('doc-specialty-input').value.trim();
    const phone = document.getElementById('doc-phone-input').value.trim();
    const clinic = document.getElementById('doc-clinic-input').value.trim();
    const commission = Number(document.getElementById('doc-commission-input').value) || 0;

    if (!name) {
        alert('Please enter Doctor Name');
        return;
    }

    if (editId) {
        const doc = doctorsList.find(d => d.id === editId);
        if (doc) {
            doc.name = name;
            doc.specialty = specialty;
            doc.phone = phone;
            doc.clinic = clinic;
            doc.commission = commission;
        }
        alert('Doctor profile updated successfully!');
    } else {
        doctorsList.push({
            id: 'DOC_' + Date.now(),
            name: name,
            specialty: specialty,
            phone: phone,
            clinic: clinic,
            commission: commission,
            createdAt: new Date().toISOString()
        });
        alert('Doctor profile added successfully!');
    }

    localStorage.setItem('mediflow_doctors', JSON.stringify(doctorsList));
    closeDoctorModal();
    renderDoctorManagement();
    if (typeof renderBillingDoctorOptions === 'function') renderBillingDoctorOptions();
}

function editDoctor(id) {
    const doc = doctorsList.find(d => d.id === id);
    if (!doc) return;

    document.getElementById('edit-doc-id').value = doc.id;
    const modalTitle = document.getElementById('doctor-modal-title');
    if (modalTitle) modalTitle.textContent = 'Edit Doctor Profile';
    document.getElementById('doc-name-input').value = doc.name || '';
    document.getElementById('doc-specialty-input').value = doc.specialty || '';
    document.getElementById('doc-phone-input').value = doc.phone || '';
    document.getElementById('doc-clinic-input').value = doc.clinic || '';
    document.getElementById('doc-commission-input').value = doc.commission || '';

    const modal = document.getElementById('doctor-modal');
    if (modal) modal.style.display = 'flex';
}

function deleteDoctor(id) {
    if (confirm('Are you sure you want to delete this Doctor profile?')) {
        doctorsList = doctorsList.filter(d => d.id !== id);
        localStorage.setItem('mediflow_doctors', JSON.stringify(doctorsList));
        renderDoctorManagement();
        if (typeof renderBillingDoctorOptions === 'function') renderBillingDoctorOptions();
    }
}

function viewDoctorSalesReport() {
    const navReports = document.querySelector('.nav-item[data-section="reports"]');
    if (navReports) navReports.click();
    const reportTypeSelect = document.getElementById('report-type');
    if (reportTypeSelect) {
        reportTypeSelect.value = 'doctor_sales';
        if (typeof generateReport === 'function') generateReport();
    }
}

window.renderDoctorManagement = renderDoctorManagement;
window.openAddDoctorModal = openAddDoctorModal;
window.closeDoctorModal = closeDoctorModal;
window.saveDoctor = saveDoctor;
window.editDoctor = editDoctor;
window.deleteDoctor = deleteDoctor;
window.viewDoctorSalesReport = viewDoctorSalesReport;
window.setTableStatus = setTableStatus;



// ==================== PHASE 2 - PROFESSIONAL BALANCE & DAILY CASH CLOSING ====================
(function(){
    const BALANCE_VERSION = 2;
    const oldDate = window.t7LocalDate;
    function localDate(d){
        const x=d instanceof Date?d:new Date(d||Date.now());
        const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
    }
    function num(v){ return Number(v)||0; }
    function cur(v){ return `${(settings&&settings.currency)||'₹'}${num(v).toFixed(2)}`; }
    function closedRecord(date){
        const r=(cashOpenings&&cashOpenings[date]);
        return r && typeof r==='object' ? r : {};
    }
    function currentUserLabel(){
        try { return sessionStorage.getItem('mediflow_current_user') || sessionStorage.getItem('mediflow_username') || 'System User'; } catch(e){ return 'System User'; }
    }
    function prevDate(date){ const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()-1); return localDate(d); }
    function getOpeningForDate(date){
        const r=closedRecord(date);
        if(r.opening !== undefined && r.opening !== null && r.opening !== '') return num(r.opening);
        const prev=closedRecord(prevDate(date));
        if(prev.counted !== undefined && prev.counted !== null && prev.counted !== '') return num(prev.counted);
        return 0;
    }
    function isClosed(date){ return !!closedRecord(date).closed; }
    function paymentIsCash(mode){ const m=String(mode||'Cash').trim().toLowerCase(); return m==='cash'||m==='cash payment'||m.includes('cash'); }
    function day(date, arr, fn){ return (arr||[]).filter(x=>String(fn(x)||x.date||'').slice(0,10)===date); }

    function calc(date){
        const ds=day(date,sales,x=>x.date).filter(s=>!s.isCancelled && s.status!=='Pending' && s.paymentMode!=='Pending' && paymentIsCash(s.paymentMode));
        const cashSales=ds.reduce((a,s)=>a+num(s.grandTotal),0);
        const cpay=day(date,customerPayments,x=>x.date).filter(p=>paymentIsCash(p.method)).reduce((a,p)=>a+num(p.amount),0);
        const pur=day(date,purchases,x=>x.date).filter(p=>paymentIsCash(p.paymentMode)).reduce((a,p)=>a+num(p.grandTotal??p.total),0);
        const spay=day(date,supplierPayments,x=>x.date).filter(p=>paymentIsCash(p.date)).reduce((a,p)=>a+num(p.amount),0);
        const exp=day(date,expenses,x=>x.date).filter(e=>paymentIsCash(e.paymentMode||'Cash')).reduce((a,e)=>a+num(e.amount),0);
        const adv=day(date,staffAdvances,x=>x.date).filter(a=>paymentIsCash(a.paymentMode)&&String(a.type||'').toLowerCase()!=='returned').reduce((a,x)=>a+num(x.amount),0);
        const advReturned=day(date,staffAdvances,x=>x.date).filter(a=>paymentIsCash(a.paymentMode)&&String(a.type||'').toLowerCase()==='returned').reduce((a,x)=>a+num(x.amount),0);
        const sal=day(date,salaryPayments,x=>x.paymentDate||x.paidAt).filter(p=>paymentIsCash(p.paymentMode)).reduce((a,p)=>a+num(p.amountPaid),0);
        const manualIn=(cashTransactions||[]).filter(t=>String(t.date).slice(0,10)===date&&t.type==='in').reduce((a,t)=>a+num(t.amount),0);
        const manualOut=(cashTransactions||[]).filter(t=>String(t.date).slice(0,10)===date&&t.type==='out').reduce((a,t)=>a+num(t.amount),0);
        const opening=getOpeningForDate(date);
        const cashIn=cashSales+cpay+manualIn+advReturned;
        const cashOut=pur+spay+exp+adv+sal+manualOut;
        const expected=opening+cashIn-cashOut;
        const r=closedRecord(date), counted=(r.counted===undefined||r.counted==='')?null:num(r.counted);
        return {date,opening,cashSales,customerCashIn:cpay,cashPurchases:pur,supplierCashOut:spay,expenseCashOut:exp,staffCashOut:adv,staffAdvanceReturned:advReturned,salaryCashOut:sal,manualIn,manualOut,cashIn,cashOut,expected,counted,variance:counted===null?null:counted-expected,closed:!!r.closed,closedAt:r.closedAt||null,closedBy:r.closedBy||null,note:r.note||'',version:BALANCE_VERSION};
    }

    function persistBalance(){
        localStorage.setItem('mediflow_cash_openings',JSON.stringify(cashOpenings));
        if(typeof syncToCloud==='function') syncToCloud('cash_openings',cashOpenings);
    }
    function persistCashTx(){
        localStorage.setItem('mediflow_cash_transactions',JSON.stringify(cashTransactions));
        if(typeof syncToCloud==='function') syncToCloud('cash_transactions',cashTransactions);
    }

    window.loadBalanceDate=function(){
        const date=document.getElementById('bal-date')?.value||localDate();
        const r=closedRecord(date), open=getOpeningForDate(date);
        const o=document.getElementById('bal-opening'), c=document.getElementById('bal-counted'), n=document.getElementById('bal-closing-note');
        if(o)o.value=open;
        if(c)c.value=r.counted??'';
        if(n)n.value=r.note||'';
        renderV2(date); renderTxV2(date); renderHistoryV2();
    };
    window.saveBalanceDay=function(){
        const date=document.getElementById('bal-date')?.value||localDate();
        const r=closedRecord(date);
        if(r.closed){ alert('This day is already closed. Reopen it before editing.'); return; }
        const opening=Math.max(0,num(document.getElementById('bal-opening')?.value));
        const raw=document.getElementById('bal-counted')?.value||'';
        const counted=raw===''?null:Math.max(0,num(raw));
        const note=(document.getElementById('bal-closing-note')?.value||'').trim();
        cashOpenings[date]={...r,opening,counted,note,version:BALANCE_VERSION,updatedAt:new Date().toISOString(),updatedBy:currentUserLabel()};
        persistBalance(); renderV2(date); renderHistoryV2();
        alert('Balance saved.');
    };
    window.closeBalanceDay=function(){
        const date=document.getElementById('bal-date')?.value||localDate(), b=calc(date);
        if(b.closed){ alert('This day is already closed.'); return; }
        if(b.counted===null){ alert('Enter Cash Counted at Closing before closing the day.'); return; }
        const r=closedRecord(date);
        if(!confirm(`Close ${date}? Expected ${cur(b.expected)}, counted ${cur(b.counted)}, difference ${cur(b.variance)}.`)) return;
        cashOpenings[date]={...r,opening:b.opening,counted:b.counted,note:(document.getElementById('bal-closing-note')?.value||'').trim(),closed:true,closedAt:new Date().toISOString(),closedBy:currentUserLabel(),version:BALANCE_VERSION};
        persistBalance(); renderV2(date); renderHistoryV2();
        alert('Day closed successfully.');
    };
    window.reopenBalanceDay=function(){
        const date=document.getElementById('bal-date')?.value||localDate(), r=closedRecord(date);
        if(!r.closed){ alert('This day is not closed.'); return; }
        const isAdmin=String(sessionStorage.getItem('mediflow_user_role')||'').toLowerCase().includes('super') || String(sessionStorage.getItem('mediflow_username')||'').toUpperCase()==='VIKI';
        if(!isAdmin){ alert('Only Super Admin can reopen a closed day.'); return; }
        if(!confirm(`Reopen ${date}? This allows balance edits again.`)) return;
        cashOpenings[date]={...r,closed:false,reopenedAt:new Date().toISOString(),reopenedBy:currentUserLabel()};
        persistBalance(); renderV2(date); renderHistoryV2();
    };
    window.addBalanceTransaction=function(){
        const date=document.getElementById('bal-date')?.value||localDate();
        if(isClosed(date)){ alert('This day is closed. Reopen it before adding cash entries.'); return; }
        const type=document.getElementById('bal-tx-type')?.value==='out'?'out':'in';
        const amount=Math.max(0,num(document.getElementById('bal-tx-amount')?.value));
        const note=(document.getElementById('bal-tx-note')?.value||'').trim();
        if(amount<=0||!note){ alert('Enter amount and reason.'); return; }
        cashTransactions.push({id:'CB'+Date.now(),branchId:currentBranchId,type,amount,note,date,createdAt:new Date().toISOString(),createdBy:currentUserLabel(),version:BALANCE_VERSION});
        persistCashTx();
        document.getElementById('bal-tx-amount').value=''; document.getElementById('bal-tx-note').value='';
        renderV2(date); renderTxV2(date); renderHistoryV2();
    };
    window.deleteBalanceTransaction=function(id){
        const date=document.getElementById('bal-date')?.value||localDate(); if(isClosed(date)){alert('Reopen the day first.');return;}
        if(!confirm('Delete this cash entry?'))return;
        cashTransactions=cashTransactions.filter(x=>x.id!==id); persistCashTx(); renderV2(date); renderTxV2(date);
    };
    function renderV2(date){
        const b=calc(date), el=document.getElementById('bal-day-summary'); if(!el)return;
        const status=b.closed?`<span style="color:var(--danger-color);">🔒 CLOSED ${b.closedAt?new Date(b.closedAt).toLocaleString():''}</span>`:'<span style="color:var(--success-color);">● OPEN</span>';
        const diff=b.variance===null?'Not counted':`${cur(b.variance)} ${b.variance===0?'✓':'⚠'}`;
        el.innerHTML=`<div style="margin-bottom:.5rem"><strong>Status:</strong> ${status}</div><div><strong>Opening:</strong> ${cur(b.opening)} &nbsp; <strong>Cash In:</strong> ${cur(b.cashIn)} &nbsp; <strong>Cash Out:</strong> ${cur(b.cashOut)}</div><div style="font-size:1.25rem;margin-top:.5rem"><strong>Expected Closing: ${cur(b.expected)}</strong></div><div style="margin-top:.4rem"><strong>Counted:</strong> ${b.counted===null?'Not entered':cur(b.counted)} &nbsp; <strong>Difference:</strong> ${diff}</div>`;
        const cards={'bal-expected-cash':b.expected};
        Object.entries(cards).forEach(([id,v])=>{const x=document.getElementById(id);if(x)x.textContent=cur(v);});
        const pos=typeof getBalancePosition==='function'?getBalancePosition():{receivable:0,payable:0,staffOutstanding:0};
        [['bal-receivable',pos.receivable],['bal-payable',pos.payable],['bal-staff-advance',pos.staffOutstanding],['bal-net-position',b.expected+pos.receivable-pos.payable-pos.staffOutstanding]].forEach(([id,v])=>{const x=document.getElementById(id);if(x)x.textContent=cur(v);});
        const st=document.getElementById('bal-close-status'); if(st)st.innerHTML=b.closed?'🔒 Day is closed — entries are locked.':'🟢 Day is open — entries can be added.';
        const oe=document.getElementById('bal-opening'); if(oe && !oe.value)oe.value=b.opening;
    }
    function renderTxV2(date){
        const el=document.getElementById('bal-transactions');if(!el)return;
        const rows=(cashTransactions||[]).filter(t=>String(t.date).slice(0,10)===date).slice().reverse();
        el.innerHTML=rows.length?`<table style="width:100%;font-size:.9rem"><thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>Amount</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.createdAt?new Date(t.createdAt).toLocaleTimeString():''}</td><td>${t.type==='in'?'Cash In':'Cash Out'}</td><td>${escapeHtml(t.note||'')}</td><td>${cur(t.amount)}</td><td><button class="btn btn-sm btn-outline" onclick="deleteBalanceTransaction('${t.id}')">Delete</button></td></tr>`).join('')}</tbody></table>`:'<div style="color:var(--text-muted)">No manual cash entries for this date.</div>';
    }
    function renderHistoryV2(){
        const el=document.getElementById('bal-history');if(!el)return;
        const entries=Object.entries(cashOpenings||{}).filter(([d,r])=>r&&typeof r==='object'&&r.version===BALANCE_VERSION).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,31);
        el.innerHTML=`<h3 style="margin-bottom:.75rem">Daily Closing History</h3>`+(entries.length?`<div class="table-responsive"><table><thead><tr><th>Date</th><th>Opening</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Status</th></tr></thead><tbody>${entries.map(([d,r])=>{const b=calc(d);return `<tr><td>${d}</td><td>${cur(b.opening)}</td><td>${cur(b.expected)}</td><td>${b.counted===null?'—':cur(b.counted)}</td><td>${b.variance===null?'—':cur(b.variance)}</td><td>${b.closed?'Closed':'Open'}</td></tr>`}).join('')}</tbody></table></div>`:'<div style="color:var(--text-muted)">No daily closing records yet.</div>');
    }
    window.printBalanceReport=function(){
        const date=document.getElementById('bal-date')?.value||localDate(),b=calc(date),w=window.open('','_blank','width=900,height=700');if(!w)return;
        w.document.write(`<html><head><title>Daily Cash Closing - ${date}</title><style>body{font-family:Arial;padding:30px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}.total{font-weight:bold}</style></head><body><h2>${escapeHtml(settings.shopName||'T7 BillPro')} - Daily Cash Closing</h2><div>Branch: ${escapeHtml(currentBranchId)} | Date: ${date}</div><table><tr><th>Component</th><th>Amount</th></tr><tr><td>Opening Cash</td><td>${cur(b.opening)}</td></tr><tr><td>Cash Sales</td><td>${cur(b.cashSales)}</td></tr><tr><td>Customer Cash Collections</td><td>${cur(b.customerCashIn)}</td></tr><tr><td>Manual Cash In</td><td>${cur(b.manualIn)}</td></tr><tr><td>Cash Purchases</td><td>${cur(b.cashPurchases)}</td></tr><tr><td>Supplier Payments</td><td>${cur(b.supplierCashOut)}</td></tr><tr><td>Expenses</td><td>${cur(b.expenseCashOut)}</td></tr><tr><td>Staff Advances</td><td>${cur(b.staffCashOut)}</td></tr><tr><td>Salary Paid</td><td>${cur(b.salaryCashOut)}</td></tr><tr><td>Manual Cash Out</td><td>${cur(b.manualOut)}</td></tr><tr class="total"><td>Expected Closing</td><td>${cur(b.expected)}</td></tr><tr><td>Counted Cash</td><td>${b.counted===null?'Not entered':cur(b.counted)}</td></tr><tr class="total"><td>Difference</td><td>${b.variance===null?'Not available':cur(b.variance)}</td></tr></table><p>Status: ${b.closed?'CLOSED':'OPEN'}</p><script>window.print()</script></body></html>`);w.document.close();
    };
    window.initBalancePage=function(){
        const d=localDate(), dateEl=document.getElementById('bal-date');if(dateEl&&!dateEl.value)dateEl.value=d;window.loadBalanceDate();
    };
    // Initialize today's date with local time and carry forward previous closing.
    setTimeout(()=>{const d=document.getElementById('bal-date');if(d&&!d.value)d.value=localDate();},0);
})();
// ==================== END PHASE 2 ====================


// --- Global boot loading animation ---
(function setupAppBootLoader(){
    const loader = document.getElementById('app-boot-loader');
    const text = document.getElementById('app-boot-text');
    if (!loader) return;
    const messages = ['Loading system...', 'Preparing workspace...', 'Loading your data...'];
    let i = 0;
    const timer = setInterval(() => {
        if (text && i < messages.length - 1) text.textContent = messages[++i];
    }, 500);
    window.finishAppBootLoader = function(){
        clearInterval(timer);
        if (text) text.textContent = 'Ready';
        setTimeout(() => loader.classList.add('is-hidden'), 180);
        setTimeout(() => loader.remove(), 650);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(window.finishAppBootLoader, 250), {once:true});
    } else {
        setTimeout(window.finishAppBootLoader, 250);
    }
})();

// ==================== WAITER MOBILE & PC ORDER INTEGRATION ====================
let isWaiterMobileMode = false;
let waiterCart = [];
let currentWaiterName = '';
let currentWaiterTable = '';
let selectedWaiterCategory = 'ALL';
let unsubscribeWaiterOrdersListener = null;

window.openWaiterLinkModal = openWaiterLinkModal;
window.closeWaiterLinkModal = closeWaiterLinkModal;
window.copyWaiterLink = copyWaiterLink;
window.resetWaiterSession = resetWaiterSession;
window.startWaiterOrderSession = startWaiterOrderSession;
window.showWaiterPickerStep = showWaiterPickerStep;
window.renderWaiterMenu = renderWaiterMenu;
window.setWaiterCategory = setWaiterCategory;
window.updateWaiterCartItem = updateWaiterCartItem;
window.handleWaiterBarcodeScan = handleWaiterBarcodeScan;
window.openWaiterReviewModal = openWaiterReviewModal;
window.closeWaiterReviewModal = closeWaiterReviewModal;
window.submitWaiterOrderToCloud = submitWaiterOrderToCloud;

function setupWaiterOrdersListener() {
    if (!isFirebaseEnabled || !db) return;
    try {
        let isInitialWaiterLoad = true;
        if (unsubscribeWaiterOrdersListener) unsubscribeWaiterOrdersListener();
        unsubscribeWaiterOrdersListener = db.collection('waiter_orders')
            .where('branchId', '==', currentBranchId)
            .onSnapshot(snapshot => {
                let pendingKey = getPendingOrdersKey();
                let digitalOrders = JSON.parse(localStorage.getItem(pendingKey)) || [];
                let updated = false;

                snapshot.docChanges().forEach(change => {
                    const data = change.doc.data();
                    const docId = change.doc.id;
                    const statusStr = (data && data.status) ? String(data.status).toLowerCase() : '';
                    
                    if (change.type === 'added' || change.type === 'modified') {
                        if (statusStr === 'pending') {
                            let idx = digitalOrders.findIndex(s => s.id === docId || s.invoiceNo === docId);
                            const orderRecord = {
                                id: docId,
                                invoiceNo: docId,
                                date: data.createdAt || data.date || new Date().toISOString(),
                                customer: data.customer || { name: 'Table ' + (data.tableNumber || '?'), phone: data.waiterName || '' },
                                orderType: 'Dine-In',
                                orderRef: data.orderRef || ('Table ' + (data.tableNumber || '?')),
                                notes: data.notes || '',
                                items: data.items || [],
                                grandTotal: parseFloat(data.totalAmount || data.grandTotal) || 0,
                                status: 'Pending',
                                isDigitalOrder: true,
                                isWaiterOrder: true,
                                waiterName: data.waiterName || '',
                                tableNumber: data.tableNumber || '',
                                branchId: data.branchId
                            };
                            if (idx !== -1) {
                                digitalOrders[idx] = orderRecord;
                            } else {
                                digitalOrders.unshift(orderRecord);
                                if (!isInitialWaiterLoad) {
                                    if (typeof playBeep === 'function') playBeep();
                                    if (typeof showMenuToast === 'function') showMenuToast(`🔔 New Waiter Order from ${orderRecord.customer.name}!`);
                                }
                            }
                            updated = true;
                        } else {
                            // If order is modified to Billed or Cancelled, remove the Pending entry
                            const prevLength = digitalOrders.length;
                            digitalOrders = digitalOrders.filter(s => s.id !== docId && s.invoiceNo !== docId);
                            if (digitalOrders.length !== prevLength) {
                                console.log(`Waiter order ${docId} removed because status changed to: ${statusStr}`);
                                updated = true;
                            }
                        }
                    } else if (change.type === 'removed') {
                        const prevLength = digitalOrders.length;
                        digitalOrders = digitalOrders.filter(s => s.id !== docId && s.invoiceNo !== docId);
                        if (digitalOrders.length !== prevLength) {
                            console.log(`Waiter order ${docId} removed because document was deleted from Firestore.`);
                            updated = true;
                        }
                    }
                });
                if (updated) {
                    localStorage.setItem(pendingKey, JSON.stringify(digitalOrders));
                    if (typeof renderDigitalOrders === 'function') renderDigitalOrders();
                }
                isInitialWaiterLoad = false;
            }, err => {
                console.error("Waiter orders listener error:", err);
            });
    } catch (e) {
        console.error("Error setting up waiter orders listener:", e);
    }
}

function openWaiterLinkModal() {
    const modal = document.getElementById('waiter-link-modal');
    const input = document.getElementById('waiter-link-input');
    const qrImg = document.getElementById('waiter-link-qr-img');
    const testBtn = document.getElementById('waiter-link-test-btn');
    const select = document.getElementById('waiter-link-select');
    if (!modal) return;

    if (select) {
        let staffData = (typeof staffList !== 'undefined' && staffList.length > 0) ? staffList : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_staff') : []);
        let waiters = Array.isArray(staffData) ? staffData : [];
        let waiterNames = [];
        waiters.forEach(s => {
            const name = typeof s === 'string' ? s : (s.name || s.staffName || s.username);
            if (name && !waiterNames.includes(name)) waiterNames.push(name);
        });
        
        let html = '<option value="">-- All Waiters (Let them select) --</option>';
        waiterNames.forEach(name => {
            html += `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`;
        });
        select.innerHTML = html;
        select.value = '';
    }

    updateWaiterLink();

    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateWaiterLink() {
    const input = document.getElementById('waiter-link-input');
    const qrImg = document.getElementById('waiter-link-qr-img');
    const testBtn = document.getElementById('waiter-link-test-btn');
    const select = document.getElementById('waiter-link-select');

    const baseUrl = window.location.href.split('#')[0].split('?')[0];

    let waiterUrl = `${baseUrl}?mode=waiter&branch=${encodeURIComponent(currentBranchId || 'main_branch')}`;
    if (select && select.value) {
        waiterUrl += `&waiter=${encodeURIComponent(select.value)}`;
    }

    if (input) input.value = waiterUrl;
    if (testBtn) testBtn.href = waiterUrl;
    if (qrImg) {
        qrImg.src = window.generateOfflineQRCode(waiterUrl, 250);
    }
}

function closeWaiterLinkModal() {
    const modal = document.getElementById('waiter-link-modal');
    if (modal) modal.style.display = 'none';
}

function copyWaiterLink() {
    const input = document.getElementById('waiter-link-input');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
        alert('📱 Waiter Order Link copied to clipboard!\n\n' + input.value);
    }).catch(() => {
        alert('Link: ' + input.value);
    });
}

function initWaiterMobileMode() {
    console.log("Initializing Waiter Mobile Mode for branch:", currentBranchId);
    
    // Hide PC elements
    const pcElements = ['login-screen', 'sidebar', 'app-boot-loader'];
    pcElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const pageSections = document.querySelectorAll('.page-section, header, .top-header, nav');
    pageSections.forEach(el => {
        if (el.id !== 'waiter-mobile-app') el.style.display = 'none';
    });

    // Show Waiter Mobile App
    const app = document.getElementById('waiter-mobile-app');
    if (app) app.style.display = 'block';

    const branchBadge = document.getElementById('waiter-mobile-branch-badge');
    if (branchBadge) branchBadge.textContent = `Branch ID: ${currentBranchId || 'Default'}`;

    // Populate pickers & menu
    populateWaiterPickers();
    renderWaiterCategories();
    renderWaiterMenu();

    // If cloud enabled, sync fresh branch data from Firestore
    if (isFirebaseEnabled && db && typeof syncFromCloud === 'function') {
        syncFromCloud().then(() => {
            if (typeof loadBranchData === 'function') loadBranchData();
            populateWaiterPickers();
            renderWaiterCategories();
            renderWaiterMenu();
        }).catch(e => {
            console.warn("Cloud sync error in waiter mode:", e);
        });
    }

    // Finish boot loader if present
    if (typeof window.finishAppBootLoader === 'function') window.finishAppBootLoader();
}

let selectedWaiterChipVal = '';
let selectedTableChipVal = '';

function selectWaiterChip(val) {
    selectedWaiterChipVal = val;
    const waiterSel = document.getElementById('wm-waiter-select');
    const customInput = document.getElementById('wm-waiter-custom');
    if (waiterSel) {
        waiterSel.value = val;
        if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
    }
    document.querySelectorAll('#wm-waiter-chips .wm-chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-val') === val);
    });
}

function selectTableChip(val) {
    selectedTableChipVal = val;
    const tableSel = document.getElementById('wm-table-select');
    const customInput = document.getElementById('wm-table-custom');
    if (tableSel) {
        tableSel.value = val;
        if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
    }
    document.querySelectorAll('#wm-table-chips .wm-chip').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-val') === val);
    });
}

window.selectWaiterChip = selectWaiterChip;
window.selectTableChip = selectTableChip;

function populateWaiterPickers() {
    const waiterSel = document.getElementById('wm-waiter-select');
    const tableSel = document.getElementById('wm-table-select');
    const waiterChipsContainer = document.getElementById('wm-waiter-chips');
    const tableChipsContainer = document.getElementById('wm-table-chips');
    
    let staffData = (typeof staffList !== 'undefined' && staffList.length > 0) ? staffList : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_staff') : []);
    let waiters = Array.isArray(staffData) ? staffData : [];
    let waiterNames = [];
    waiters.forEach(s => {
        const name = typeof s === 'string' ? s : (s.name || s.staffName || s.username);
        if (name && !waiterNames.includes(name)) waiterNames.push(name);
    });
    if (waiterNames.length === 0) waiterNames = ['Staff', 'Waiter 1', 'Waiter 2'];

    if (waiterSel) {
        let html = '<option value="">-- Choose Waiter --</option>';
        waiterNames.forEach(name => {
            html += `<option value="${name}" ${selectedWaiterChipVal === name ? 'selected' : ''}>${name}</option>`;
        });
        html += `<option value="OTHER" ${selectedWaiterChipVal === 'OTHER' ? 'selected' : ''}>+ Type Custom Name</option>`;
        waiterSel.innerHTML = html;

        if (selectedWaiterChipVal) waiterSel.value = selectedWaiterChipVal;

        waiterSel.onchange = function() {
            const val = this.value;
            selectedWaiterChipVal = val;
            const customInput = document.getElementById('wm-waiter-custom');
            if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
            document.querySelectorAll('#wm-waiter-chips .wm-chip').forEach(c => {
                c.classList.toggle('active', c.getAttribute('data-val') === val);
            });
        };
    }

    if (waiterChipsContainer) {
        let chipHtml = '';
        waiterNames.forEach(name => {
            const isAct = (selectedWaiterChipVal === name);
            chipHtml += `<button type="button" class="wm-chip ${isAct ? 'active' : ''}" data-val="${name}" onclick="selectWaiterChip('${name.replace(/'/g, "\\'")}')">👨‍🍳 ${name}</button>`;
        });
        const isOtherAct = (selectedWaiterChipVal === 'OTHER');
        chipHtml += `<button type="button" class="wm-chip ${isOtherAct ? 'active' : ''}" data-val="OTHER" onclick="selectWaiterChip('OTHER')">✏️ Custom</button>`;
        waiterChipsContainer.innerHTML = chipHtml;
    }

    let tablesData = (typeof tableList !== 'undefined' && tableList.length > 0) ? tableList : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_tables') : []);
    let tables = Array.isArray(tablesData) ? tablesData : [];
    let tableNames = [];
    tables.forEach(t => {
        const tName = typeof t === 'string' ? t : (t.tableName || t.name || t.id);
        if (tName && !tableNames.includes(tName)) tableNames.push(tName);
    });
    if (tableNames.length === 0) {
        for (let i = 1; i <= 12; i++) {
            tableNames.push(`Table ${i}`);
        }
    }

    if (tableSel) {
        let html = '<option value="">-- Choose Table --</option>';
        tableNames.forEach(tName => {
            html += `<option value="${tName}" ${selectedTableChipVal === tName ? 'selected' : ''}>${tName}</option>`;
        });
        html += `<option value="OTHER" ${selectedTableChipVal === 'OTHER' ? 'selected' : ''}>+ Type Custom Table</option>`;
        tableSel.innerHTML = html;

        if (selectedTableChipVal) tableSel.value = selectedTableChipVal;

        tableSel.onchange = function() {
            const val = this.value;
            selectedTableChipVal = val;
            const customInput = document.getElementById('wm-table-custom');
            if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
            document.querySelectorAll('#wm-table-chips .wm-chip').forEach(c => {
                c.classList.toggle('active', c.getAttribute('data-val') === val);
            });
        };
    }

    if (tableChipsContainer) {
        let chipHtml = '';
        tableNames.forEach(tName => {
            const isAct = (selectedTableChipVal === tName);
            chipHtml += `<button type="button" class="wm-chip ${isAct ? 'active' : ''}" data-val="${tName}" onclick="selectTableChip('${tName.replace(/'/g, "\\'")}')">🍽️ ${tName}</button>`;
        });
        const isOtherAct = (selectedTableChipVal === 'OTHER');
        chipHtml += `<button type="button" class="wm-chip ${isOtherAct ? 'active' : ''}" data-val="OTHER" onclick="selectTableChip('OTHER')">✏️ Custom</button>`;
        tableChipsContainer.innerHTML = chipHtml;
    }
}

function startWaiterOrderSession() {
    const waiterSel = document.getElementById('wm-waiter-select');
    const waiterCustom = document.getElementById('wm-waiter-custom');
    const tableSel = document.getElementById('wm-table-select');
    const tableCustom = document.getElementById('wm-table-custom');

    let wName = selectedWaiterChipVal || (waiterSel ? waiterSel.value : '');
    if (wName === 'OTHER' && waiterCustom) wName = waiterCustom.value.trim();
    
    let tNum = selectedTableChipVal || (tableSel ? tableSel.value : '');
    if (tNum === 'OTHER' && tableCustom) tNum = tableCustom.value.trim();

    if (!wName) {
        alert('Please select or enter a Waiter Name!');
        return;
    }
    if (!tNum) {
        alert('Please select or enter a Table Number!');
        return;
    }

    currentWaiterName = wName;
    currentWaiterTable = tNum;

    const sessionInfo = document.getElementById('wm-session-info');
    if (sessionInfo) sessionInfo.textContent = `${tNum} • Waiter: ${wName}`;

    document.getElementById('waiter-picker-step').style.display = 'none';
    document.getElementById('waiter-menu-step').style.display = 'block';
    document.getElementById('wm-bottom-bar').style.display = 'block';

    renderWaiterCategories();
    renderWaiterMenu();
}

function showWaiterPickerStep() {
    document.getElementById('waiter-picker-step').style.display = 'block';
    document.getElementById('waiter-menu-step').style.display = 'none';
}

function resetWaiterSession() {
    if (waiterCart.length > 0) {
        if (!confirm('Discard active waiter order and reset?')) return;
    }
    waiterCart = [];
    currentWaiterName = '';
    currentWaiterTable = '';
    selectedWaiterChipVal = '';
    selectedTableChipVal = '';
    updateWaiterCartUI();
    populateWaiterPickers();
    showWaiterPickerStep();
}

function renderWaiterCategories() {
    const container = document.getElementById('wm-category-pills');
    if (!container) return;

    let catList = (typeof categories !== 'undefined' && categories.length > 0) ? categories : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_categories') : []);
    let cats = Array.isArray(catList) ? catList.map(c => typeof c === 'string' ? c : c.name) : [];

    let html = `<button type="button" class="wm-pill ${selectedWaiterCategory === 'ALL' ? 'active' : ''}" onclick="setWaiterCategory('ALL')">All Items</button>`;
    cats.forEach(cat => {
        if (!cat) return;
        html += `<button type="button" class="wm-pill ${selectedWaiterCategory === cat ? 'active' : ''}" onclick="setWaiterCategory('${cat.replace(/'/g, "\\'")}')">${cat}</button>`;
    });
    container.innerHTML = html;
}

function setWaiterCategory(cat) {
    selectedWaiterCategory = cat;
    renderWaiterCategories();
    renderWaiterMenu();
}

let waiterMenuViewMode = 'grid';

function setWaiterMenuViewMode(mode) {
    waiterMenuViewMode = mode;
    const gridBtn = document.getElementById('wm-view-grid-btn');
    const listBtn = document.getElementById('wm-view-list-btn');
    if (gridBtn) {
        gridBtn.style.background = (mode === 'grid') ? 'var(--primary-color)' : 'transparent';
        gridBtn.style.color = (mode === 'grid') ? 'white' : 'var(--text-color)';
    }
    if (listBtn) {
        listBtn.style.background = (mode === 'list') ? 'var(--primary-color)' : 'transparent';
        listBtn.style.color = (mode === 'list') ? 'white' : 'var(--text-color)';
    }
    renderWaiterMenu();
}

window.setWaiterMenuViewMode = setWaiterMenuViewMode;

function getCategoryEmoji(catName = '', prodName = '') {
    const combined = (String(catName) + ' ' + String(prodName)).toLowerCase();
    if (combined.includes('coffee') || combined.includes('tea') || combined.includes('hot')) return '☕';
    if (combined.includes('cake') || combined.includes('bun') || combined.includes('bakery') || combined.includes('pudding')) return '🍰';
    if (combined.includes('burger') || combined.includes('snack') || combined.includes('20 rs') || combined.includes('25rs')) return '🍔';
    if (combined.includes('juice') || combined.includes('drink') || combined.includes('beverage') || combined.includes('soda')) return '🥤';
    if (combined.includes('rice') || combined.includes('biryani') || combined.includes('meal')) return '🍲';
    if (combined.includes('pizza')) return '🍕';
    if (combined.includes('ice') || combined.includes('cream') || combined.includes('dessert')) return '🍦';
    if (combined.includes('capsule') || combined.includes('tablet') || combined.includes('syrup')) return '💊';
    return '🍽️';
}

function renderWaiterMenu() {
    const listEl = document.getElementById('wm-product-list');
    const searchInputVal = document.getElementById('wm-search-input') ? document.getElementById('wm-search-input').value.toLowerCase().trim() : '';
    const barcodeInputVal = document.getElementById('wm-barcode-input') ? document.getElementById('wm-barcode-input').value.toLowerCase().trim() : '';
    const searchVal = searchInputVal || barcodeInputVal;
    if (!listEl) return;

    if (waiterMenuViewMode === 'grid') {
        listEl.style.display = 'grid';
        listEl.style.gridTemplateColumns = 'repeat(2, 1fr)';
        listEl.style.gap = '12px';
    } else {
        listEl.style.display = 'grid';
        listEl.style.gridTemplateColumns = '1fr';
        listEl.style.gap = '10px';
    }

    let prods = (typeof products !== 'undefined' && products.length > 0) ? products : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_products') : []);
    if (!Array.isArray(prods)) prods = [];

    let filtered = prods.filter(p => {
        const matchesCat = (selectedWaiterCategory === 'ALL') || (p.category === selectedWaiterCategory);
        const pBarcode = String(p.barcode || p.sku || p.code || p.id || '').toLowerCase();
        const matchesSearch = !searchVal || 
            (p.name && p.name.toLowerCase().includes(searchVal)) || 
            (p.category && p.category.toLowerCase().includes(searchVal)) ||
            (pBarcode && pBarcode.includes(searchVal));
        return matchesCat && matchesSearch;
    });

    const sortVal = document.getElementById('wm-sort-select') ? document.getElementById('wm-sort-select').value : 'default';
    if (sortVal === 'a-z') {
        filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else if (sortVal === 'z-a') {
        filtered.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
    } else if (sortVal === 'price-asc') {
        filtered.sort((a, b) => {
            const pA = parseFloat(a.salePrice || a.price || a.mrp || 0) || 0;
            const pB = parseFloat(b.salePrice || b.price || b.mrp || 0) || 0;
            return pA - pB;
        });
    } else if (sortVal === 'price-desc') {
        filtered.sort((a, b) => {
            const pA = parseFloat(a.salePrice || a.price || a.mrp || 0) || 0;
            const pB = parseFloat(b.salePrice || b.price || b.mrp || 0) || 0;
            return pB - pA;
        });
    }

    if (filtered.length === 0) {
        listEl.style.gridTemplateColumns = '1fr';
        listEl.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); grid-column: 1 / -1;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🔍</div>
                <div style="font-weight: 700; font-size: 1rem; color: var(--text-color);">No Menu Items Found</div>
                <div style="font-size: 0.85rem; margin-top: 4px;">Try searching another keyword or tap "All Items"</div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    let currSymbol = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '$';
    let html = '';
    filtered.forEach(p => {
        const pId = p.id || p.name;
        const cartItem = waiterCart.find(ci => String(ci.id) === String(pId));
        const qty = cartItem ? cartItem.qty : 0;
        const price = parseFloat(p.salePrice || p.price || p.mrp || 0);

        if (waiterMenuViewMode === 'grid') {
            const emoji = getCategoryEmoji(p.category, p.name);
            html += `
                <div class="wm-product-card-grid ${qty > 0 ? 'has-qty' : ''}">
                    ${qty > 0 ? `<div class="wm-card-badge">${qty}</div>` : ''}
                    <div style="width: 100%; height: 50px; border-radius: 12px; background: linear-gradient(135deg, rgba(37,99,235,0.08), rgba(139,92,246,0.08)); display: flex; align-items: center; justify-content: center; margin-bottom: 8px; font-size: 1.6rem; flex-shrink: 0;">
                        ${emoji}
                    </div>
                    <div style="flex: 1; margin-bottom: 8px;">
                        <div style="font-weight: 800; font-size: 0.92rem; color: var(--text-color); line-height: 1.25; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.3em;" title="${p.name}">
                            ${p.name}
                        </div>
                        <div style="font-size: 0.95rem; font-weight: 900; color: var(--primary-color);">
                            ${currSymbol}${price.toFixed(2)}
                        </div>
                        ${p.category ? `<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 8px; background: rgba(37,99,235,0.08); color: var(--primary-color); font-weight: 600; display: inline-block; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px;">${p.category}</span>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 4px;">
                        ${qty > 0 ? `
                            <button type="button" class="wm-qty-btn" style="flex: 1; height: 34px;" onclick="updateWaiterCartItem('${pId.replace(/'/g, "\\'")}', -1)">-</button>
                            <span class="wm-qty-count" style="min-width: 20px;">${qty}</span>
                        ` : ''}
                        <button type="button" class="wm-qty-btn wm-qty-btn-add" style="flex: 1; height: 34px; width: 100%; border-radius: 10px; font-weight: 800;" onclick="updateWaiterCartItem('${pId.replace(/'/g, "\\'")}', 1)">
                            ${qty > 0 ? '+' : '+ ADD'}
                        </button>
                    </div>
                </div>
            `;
        } else {
            // List View
            html += `
                <div class="wm-product-card ${qty > 0 ? 'has-qty' : ''}">
                    <div style="flex: 1; padding-right: 10px;">
                        <div style="font-weight: 700; font-size: 0.98rem; color: var(--text-color); margin-bottom: 2px;">${p.name}</div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.9rem; color: var(--primary-color); font-weight: 800;">${currSymbol}${price.toFixed(2)}</span>
                            ${p.category ? `<span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(37,99,235,0.08); color: var(--primary-color); font-weight: 600;">${p.category}</span>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${qty > 0 ? `
                            <button type="button" class="wm-qty-btn" onclick="updateWaiterCartItem('${pId.replace(/'/g, "\\'")}', -1)">-</button>
                            <span class="wm-qty-count">${qty}</span>
                        ` : ''}
                        <button type="button" class="wm-qty-btn wm-qty-btn-add" onclick="updateWaiterCartItem('${pId.replace(/'/g, "\\'")}', 1)">+</button>
                    </div>
                </div>
            `;
        }
    });

    listEl.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateWaiterCartItem(pId, change) {
    pId = String(pId);
    let prods = (typeof products !== 'undefined' && products.length > 0) ? products : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_products') : []);
    const prod = prods.find(p => String(p.id) === pId || String(p.name) === pId);
    
    let cartIndex = waiterCart.findIndex(item => String(item.id) === pId);

    if (cartIndex > -1) {
        waiterCart[cartIndex].qty += change;
        if (waiterCart[cartIndex].qty <= 0) {
            waiterCart.splice(cartIndex, 1);
        }
    } else if (change > 0 && prod) {
        const itemPrice = parseFloat(prod.salePrice || prod.price || prod.mrp || 0);
        waiterCart.push({
            id: String(prod.id || ('P_' + Date.now())),
            name: prod.name,
            price: itemPrice,
            qty: 1
        });
    }

    updateWaiterCartUI();
    renderWaiterMenu();
}

function handleWaiterBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const barcodeVal = e.target.value.trim().toLowerCase();
        if (!barcodeVal) return;

        let prods = (typeof products !== 'undefined' && products.length > 0) ? products : (typeof getLegacyOrBranchData === 'function' ? getLegacyOrBranchData('mediflow_products') : []);
        if (!Array.isArray(prods)) prods = [];

        const matchedProd = prods.find(p => {
            const b = String(p.barcode || p.sku || p.code || p.id || '').toLowerCase();
            return b === barcodeVal;
        });

        if (matchedProd) {
            const prodIdentifier = matchedProd.id || matchedProd.name;
            updateWaiterCartItem(prodIdentifier, 1);
            e.target.value = '';
            if (typeof showMenuToast === 'function') {
                showMenuToast(`📦 Added: ${matchedProd.name}`);
            } else {
                alert(`📦 Added to Order: ${matchedProd.name}`);
            }
        } else {
            const searchInput = document.getElementById('wm-search-input');
            if (searchInput) {
                searchInput.value = barcodeVal;
                renderWaiterMenu();
            }
            alert(`No product found matching barcode "${barcodeVal}"`);
        }
    }
}

function updateWaiterCartUI() {
    let count = 0;
    let total = 0;
    waiterCart.forEach(item => {
        count += item.qty;
        total += item.price * item.qty;
    });

    const countEl = document.getElementById('wm-cart-count');
    const totalEl = document.getElementById('wm-cart-total');
    let currSymbol = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '$';

    if (countEl) countEl.textContent = `${count} item(s) selected`;
    if (totalEl) totalEl.textContent = `${currSymbol}${total.toFixed(2)}`;
}

function updateReviewModalItemQty(pId, change) {
    updateWaiterCartItem(pId, change);
    if (waiterCart.length === 0) {
        closeWaiterReviewModal();
    } else {
        openWaiterReviewModal();
    }
}

window.updateReviewModalItemQty = updateReviewModalItemQty;

function addCookingNoteSuggestion(text) {
    const notesInput = document.getElementById('wm-order-notes');
    if (!notesInput) return;
    const current = notesInput.value.trim();
    if (!current) {
        notesInput.value = text;
    } else if (!current.includes(text)) {
        notesInput.value = current + ', ' + text;
    }
}

window.addCookingNoteSuggestion = addCookingNoteSuggestion;

function openWaiterReviewModal() {
    if (waiterCart.length === 0) {
        alert('Your order cart is empty! Add items first.');
        return;
    }

    const modal = document.getElementById('wm-review-modal');
    const info = document.getElementById('wm-review-table-waiter');
    const itemsContainer = document.getElementById('wm-review-items');
    const grandTotalEl = document.getElementById('wm-review-grand-total');

    if (!modal) return;

    if (info) {
        info.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                <span style="background: rgba(37,99,235,0.12); color: var(--primary-color); padding: 4px 10px; border-radius: 8px; font-weight: 800; font-size: 0.9rem;">
                    🍽️ ${currentWaiterTable || 'Table 1'}
                </span>
                <span style="background: rgba(139,92,246,0.12); color: #8b5cf6; padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 0.85rem;">
                    👨‍🍳 Waiter: ${currentWaiterName || 'Staff'}
                </span>
            </div>
        `;
    }

    let currSymbol = (typeof settings !== 'undefined' && settings.currency) ? settings.currency : '$';
    let total = 0;
    let html = '';

    waiterCart.forEach(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        const emoji = getCategoryEmoji('', item.name);

        html += `
            <div style="background: var(--bg-color); border-radius: 14px; padding: 12px 14px; margin-bottom: 10px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 10px; box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                    <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(37,99,235,0.08); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                        ${emoji}
                    </div>
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-top: 1px;">
                            ${currSymbol}${item.price.toFixed(2)} × ${item.qty} = <span style="color: var(--primary-color); font-weight: 800;">${currSymbol}${itemTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <button type="button" class="wm-qty-btn" style="width: 32px; height: 32px; font-size: 1.1rem; border-radius: 8px;" onclick="updateReviewModalItemQty('${item.id.replace(/'/g, "\\'")}', -1)">-</button>
                    <span style="font-weight: 900; font-size: 0.95rem; min-width: 20px; text-align: center; color: var(--text-color);">${item.qty}</span>
                    <button type="button" class="wm-qty-btn wm-qty-btn-add" style="width: 32px; height: 32px; font-size: 1.1rem; border-radius: 8px;" onclick="updateReviewModalItemQty('${item.id.replace(/'/g, "\\'")}', 1)">+</button>
                </div>
            </div>
        `;
    });

    if (itemsContainer) itemsContainer.innerHTML = html;
    if (grandTotalEl) grandTotalEl.textContent = `${currSymbol}${total.toFixed(2)}`;

    modal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeWaiterReviewModal() {
    const modal = document.getElementById('wm-review-modal');
    if (modal) modal.style.display = 'none';
}

async function submitWaiterOrderToCloud() {
    if (waiterCart.length === 0) return;

    const btn = document.getElementById('wm-submit-order-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Sending Order...';
    }

    const orderId = 'WORD-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 100);
    let totalAmt = 0;
    const itemsPayload = waiterCart.map(item => {
        const sub = item.price * item.qty;
        totalAmt += sub;
        return {
            id: item.id,
            name: item.name,
            price: item.price,
            salePrice: item.price,
            qty: item.qty,
            total: sub
        };
    });

    const safeTable = String(currentWaiterTable || '1');
    const tableStr = safeTable.toLowerCase().startsWith('table') ? safeTable : ('Table ' + safeTable);
    const orderNotes = document.getElementById('wm-order-notes') ? document.getElementById('wm-order-notes').value.trim() : '';

    const orderData = {
        id: orderId,
        invoiceNo: orderId,
        branchId: (typeof currentBranchId !== 'undefined' ? currentBranchId : 'main_branch'),
        waiterName: currentWaiterName,
        tableNumber: currentWaiterTable,
        customer: { name: tableStr, phone: currentWaiterName },
        customerName: tableStr + ' (' + currentWaiterName + ')',
        orderType: 'Dine-In',
        orderRef: tableStr,
        notes: orderNotes,
        items: itemsPayload,
        totalAmount: totalAmt,
        grandTotal: totalAmt,
        status: 'Pending',
        isDigitalOrder: true,
        isWaiterOrder: true,
        createdAt: new Date().toISOString(),
        date: new Date().toISOString()
    };

    try {
        if (isFirebaseEnabled && db) {
            // Send to Firebase asynchronously in the background so it doesn't block the Waiter UI
            db.collection('waiter_orders').doc(orderId).set(orderData).catch(err => {
                console.error("Firebase background sync failed:", err);
                alert(`🚨 CRITICAL ERROR: Order #${orderId} FAILED to reach the PC/Kitchen!\nReason: ${err.message}\n\nPlease check your internet and re-enter this order.`);
            });
        } else {
            // Local fallback branch-specific
            const pendingKey = `mediflow_${(typeof currentBranchId !== 'undefined' ? currentBranchId : 'branch_default')}_digital_orders`;
            let localOrders = JSON.parse(localStorage.getItem(pendingKey)) || [];
            localOrders.unshift(orderData);
            localStorage.setItem(pendingKey, JSON.stringify(localOrders));
        }

        // Fast, non-blocking notification
        if (typeof showMenuToast === 'function') {
            showMenuToast(`✅ Order #${orderId} Sent! (Table: ${currentWaiterTable})`);
        }
        
        waiterCart = [];
        updateWaiterCartUI();
        closeWaiterReviewModal();
        renderWaiterMenu();
    } catch (e) {
        console.error("Error submitting waiter order:", e);
        alert("Failed to process order: " + (e.message || e));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send"></i> Send Order';
        }
    }
}

