// Initialize Lucide Icons
lucide.createIcons();

const app = {
    db: null,
    html5QrcodeScanner: null,
    currentScanMode: 'IN', // 'IN' or 'OUT'
    itemsCache: [], // Cache to avoid excessive reads
    transactionsCache: [],
    balanceCache: 0, // Current wallet balance
    listenersInitialized: false,

    // User's Secure Firebase Config
    firebaseConfig: {
        apiKey: "AIzaSyBF561VBLYB78jKwSsmD13zrdZpwUWzDx0",
        authDomain: "pikamall.firebaseapp.com",
        projectId: "pikamall",
        storageBucket: "pikamall.firebasestorage.app",
        messagingSenderId: "464341365772",
        appId: "1:464341365772:web:783e308ba1936c9302ea29",
        measurementId: "G-NTGKFKLL1P"
    },

    init: function () {
        this.setupNavigation();
        this.initFirebase();
        this.setupForms();
        this.setupScanModeListeners();
    },

    setupNavigation: function () {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = btn.getAttribute('data-target');
                this.navigate(target);
            });
        });
    },

    navigate: function (viewId) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-target') === viewId) {
                btn.classList.add('active');
            }
        });

        // Hide all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Show target view
        document.getElementById(`view-${viewId}`).classList.add('active');

        // Stop scanner if navigating away from scan view
        if (viewId !== 'scan' && this.html5QrcodeScanner) {
            this.stopScanner();
        }

        // View specific logic
        switch (viewId) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'items':
                this.loadItems();
                break;
            case 'scan':
                this.startScanner();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'balance':
                this.renderBalanceView();
                break;
            case 'settings':
                // Settings view logic if any
                break;
        }
    },

    // --- FIREBASE LOGIC ---

    initFirebase: function () {
        try {
            firebase.initializeApp(this.firebaseConfig);
            this.db = firebase.firestore();
            this.auth = firebase.auth();
            console.log("Firebase initialized");

            // Listen for auth state changes
            this.auth.onAuthStateChanged((user) => {
                if (user) {
                    // User is signed in
                    document.getElementById('login-container').classList.add('hidden');
                    document.getElementById('app-container').classList.remove('hidden');

                    // Setup realtime listeners
                    this.setupRealtimeListeners();

                    // Initial load after login
                    this.navigate('dashboard');
                } else {
                    // No user is signed in
                    document.getElementById('app-container').classList.add('hidden');
                    document.getElementById('login-container').classList.remove('hidden');
                }
            });
        } catch (e) {
            console.error("Firebase init error", e);
            alert("Gagal koneksi ke database. Pastikan koneksi internet stabil.");
        }
    },

    handleGoogleLogin: async function () {
        const btn = document.getElementById('btn-google-login');
        const originalContent = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" class="google-icon"> <span>Masuk...</span>';

        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: 'select_account'
            });
            await this.auth.signInWithPopup(provider);
            this.showToast("Berhasil Login!");
        } catch (error) {
            console.error(error);
            alert("Gagal Login: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    },

    handleLogout: async function () {
        if (confirm("Yakin ingin keluar?")) {
            try {
                await this.auth.signOut();
                this.showToast("Berhasil Logout");
                // Reset listener init flag on logout
                this.listenersInitialized = false;
            } catch (error) {
                console.error(error);
            }
        }
    },

    setupRealtimeListeners: function () {
        if (this.listenersInitialized) return;
        this.listenersInitialized = true;

        // Listen to items collection
        this.db.collection('items').onSnapshot((snap) => {
            this.itemsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Re-render items view if currently active
            if (document.getElementById('view-items').classList.contains('active')) {
                this.renderItems(this.itemsCache);
            }

            // Re-render dashboard statistics
            this.updateDashboardStats();
        }, (error) => {
            console.error("Realtime items error:", error);
        });

        // Listen to transactions collection
        this.db.collection('transactions').onSnapshot((snap) => {
            this.transactionsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.transactionsCache.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Re-render dashboard recent transactions table
            this.updateDashboardTransactions();

            // Re-render reports view if currently active
            if (document.getElementById('view-reports').classList.contains('active')) {
                this.loadReports();
            }

            // Re-render balance view if currently active
            if (document.getElementById('view-balance').classList.contains('active')) {
                this.renderBalanceView();
            }
        }, (error) => {
            console.error("Realtime transactions error:", error);
        });

        // Listen to wallet document for real-time balance updates
        this.db.collection('settings').doc('wallet').onSnapshot((doc) => {
        }, (error) => {
            console.error("Realtime wallet error:", error);
        });
    },

    // --- DASHBOARD ---

    loadDashboardData: function () {
        this.updateDashboardStats();
        this.updateDashboardTransactions();
    },

    updateDashboardStats: function () {
        let totalItems = 0;
        this.itemsCache.forEach(item => {
            totalItems += parseInt(item.stock || 0);
        });
        const statTotal = document.getElementById('stat-total-items');
        if (statTotal) statTotal.textContent = totalItems;

        let inBulanIni = 0;
        let outBulanIni = 0;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        this.transactionsCache.forEach(t => {
            const tDate = new Date(t.date);
            if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                if (t.type === 'IN') inBulanIni += parseInt(t.qty);
                if (t.type === 'OUT') outBulanIni += parseInt(t.qty);
            }
        });

        const statIn = document.getElementById('stat-items-in');
        const statOut = document.getElementById('stat-items-out');
        if (statIn) statIn.textContent = inBulanIni;
        if (statOut) statOut.textContent = outBulanIni;
    },

    updateDashboardTransactions: function () {
        const tbody = document.querySelector('#recent-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.transactionsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada transaksi</td></tr>';
        } else {
            this.transactionsCache.slice(0, 5).forEach(t => {
                const badgeClass = t.type === 'IN' ? 'badge-in' : 'badge-out';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(t.date).toLocaleDateString('id-ID')}</td>
                    <td><span class="${badgeClass}">${t.type}</span></td>
                    <td>${t.itemName || t.itemId}</td>
                    <td class="font-bold ${t.type === 'IN' ? 'text-green-600' : 'text-danger'}">${t.type === 'IN' ? '+' : '-'}${t.qty}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    },

    // --- ITEMS (MASTER DATA) ---

    loadItems: function () {
        this.renderItems(this.itemsCache);
    },

    renderItems: function (items) {
        const container = document.getElementById('items-container');
        container.innerHTML = '';

        if (items.length === 0) {
            container.innerHTML = '<div class="text-center text-muted w-full py-8">Belum ada barang. Silakan tambah barang baru.</div>';
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item-card glass-card';
            div.innerHTML = `
                <div class="item-header">
                    <div>
                        <div class="item-id">${item.id}</div>
                        <h3 class="item-name">${item.name}</h3>
                        <p class="item-price">Jual: Rp ${this.formatRp(item.price)}</p>
                    </div>
                    <div class="item-stock text-right">
                        <div>${item.stock}</div>
                        <div class="text-xs text-muted">Stok</div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-secondary text-sm" onclick="app.openPrintModal('${item.id}', '${item.name}', '${item.price}')">
                        <i data-lucide="printer" class="w-4 h-4"></i> Print
                    </button>
                    <button class="btn-secondary text-sm" onclick="app.openEditModal('${item.id}')">
                        <i data-lucide="edit-2" class="w-4 h-4"></i> Edit
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
        lucide.createIcons();
    },

    filterItems: function () {
        const q = document.getElementById('search-item').value.toLowerCase();
        const filtered = this.itemsCache.filter(item =>
            item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
        );
        this.renderItems(filtered);
    },

    setupForms: function () {
        // Add Item Form
        document.getElementById('form-add-item').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-item');
            btn.disabled = true;
            btn.textContent = "Menyimpan...";

            const name = document.getElementById('input-item-name').value;
            const cost = document.getElementById('input-item-cost').value;
            const price = document.getElementById('input-item-price').value;
            const stock = document.getElementById('input-item-stock').value;

            const id = 'BRG-' + Math.floor(1000 + Math.random() * 9000); // Generate simple ID

            try {
                await this.db.collection('items').doc(id).set({
                    name: name,
                    cost: parseInt(cost),
                    price: parseInt(price),
                    stock: parseInt(stock),
                    createdAt: new Date().toISOString()
                });
                this.showToast("Barang berhasil ditambahkan");
                this.closeModal('modal-add-item');
                e.target.reset();
                this.loadItems();
            } catch (error) {
                console.error(error);
                alert("Gagal menyimpan data");
            } finally {
                btn.disabled = false;
                btn.textContent = "Simpan";
            }
        });

        // Edit Item Form
        document.getElementById('form-edit-item').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-item-id').value;
            const name = document.getElementById('edit-item-name').value;
            const cost = document.getElementById('edit-item-cost').value;
            const price = document.getElementById('edit-item-price').value;

            try {
                await this.db.collection('items').doc(id).update({
                    name: name,
                    cost: parseInt(cost),
                    price: parseInt(price)
                });
                this.showToast("Barang diupdate");
                this.closeModal('modal-edit-item');
                this.loadItems();
            } catch (error) {
                console.error(error);
                alert("Gagal update data");
            }
        });

        // Transaction Form (Manual or post-scan)
        document.getElementById('form-transaction').addEventListener('submit', async (e) => {
            e.preventDefault();
            const itemId = document.getElementById('transaction-item-id').value;
            const type = document.getElementById('transaction-type').value;
            const qty = parseInt(document.getElementById('transaction-qty').value);
            const note = document.getElementById('transaction-note').value;

            await this.processTransaction(itemId, type, qty, note);
            this.closeModal('modal-transaction');
            document.getElementById('form-transaction').reset();

            // Resume scanner if in scan view
            if (document.getElementById('view-scan').classList.contains('active')) {
                if (this.html5QrcodeScanner) {
                    this.html5QrcodeScanner.resume();
                }
            }
        });

        // Manual Barcode Entry
        document.getElementById('form-manual-entry').addEventListener('submit', (e) => {
            e.preventDefault();
            const barcode = document.getElementById('manual-barcode-input').value;
            if (barcode) {
                this.handleBarcodeScan(barcode);
                document.getElementById('manual-barcode-input').value = '';
            }
        });

        // Print Button
        document.getElementById('btn-do-print').addEventListener('click', () => {
            this.executePrint();
        });

        // Adjust Balance Form
        document.getElementById('form-adjust-balance').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-balance');
            btn.disabled = true;
            btn.textContent = 'Menyimpan...';

            const newBalance = parseInt(document.getElementById('input-new-balance').value);
            const note = document.getElementById('input-adjust-note').value;

            const modalMasuk = parseInt(
                document.getElementById('input-new-balance').value || 0
            );

            try {
                const batch = this.db.batch();

                // Update wallet balance
                const modalMasuk = parseInt(
                    document.getElementById('input-new-balance').value || 0
                );

                const saldoBaru = this.balanceCache + modalMasuk;
                const walletRef = this.db.collection('settings').doc('wallet');
                batch.set(walletRef, {
                    balance: firebase.firestore.FieldValue.increment(modalMasuk)
                }, { merge: true });

                // Record adjustment transaction for audit trail
                const txRef = this.db.collection('transactions').doc();
                batch.set(txRef, {
                    itemId: '-',
                    itemName: 'Tambah Modal',
                    type: 'WALLETADJ',
                    qty: 0,
                    cost: 0,
                    price: modalMasuk,
                    note: note,
                    date: new Date().toISOString()
                });

                await batch.commit();
                this.showToast('Saldo berhasil diatur!');
                this.closeModal('modal-adjust-balance');
                e.target.reset();
            } catch (err) {
                console.error(err);
                alert('Gagal menyimpan saldo: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Simpan Saldo';
            }
        });
    },

    openEditModal: function (id) {
        const item = this.itemsCache.find(i => i.id === id);
        if (!item) return;

        document.getElementById('edit-item-id').value = item.id;
        document.getElementById('edit-item-name').value = item.name;
        document.getElementById('edit-item-cost').value = item.cost;
        document.getElementById('edit-item-price').value = item.price;

        this.showModal('modal-edit-item');
    },

    deleteItem: async function () {
        const id = document.getElementById('edit-item-id').value;
        if (confirm("Yakin ingin menghapus barang ini?")) {
            try {
                await this.db.collection('items').doc(id).delete();
                this.showToast("Barang dihapus");
                this.closeModal('modal-edit-item');
                this.loadItems();
            } catch (e) {
                alert("Gagal menghapus");
            }
        }
    },

    // --- SCANNER ---

    setupScanModeListeners: function () {
        document.querySelectorAll('input[name="scanMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentScanMode = e.target.value;
            });
        });
    },

    startScanner: function () {
        if (this.html5QrcodeScanner) return; // already running

        this.html5QrcodeScanner = new Html5Qrcode("reader");
        const config = { fps: 10, qrbox: { width: 250, height: 150 } };

        this.html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText, decodedResult) => {
                // Pause scanner to prevent multiple triggers
                if (this.html5QrcodeScanner.getState() === 2) { // 2 = SCANNING
                    this.html5QrcodeScanner.pause(true);
                }
                this.handleBarcodeScan(decodedText);
            },
            (errorMessage) => {
                // parse error, ignore mostly
            }
        ).catch(err => {
            console.error("Failed to start scanner", err);
            document.getElementById('reader-container').innerHTML = `
                <div class="p-4 text-center text-danger bg-red-900 bg-opacity-20 rounded-lg h-full flex items-center justify-center">
                    Gagal mengakses kamera. Pastikan browser memiliki izin kamera.
                </div>
            `;
        });
    },

    stopScanner: function () {
        if (this.html5QrcodeScanner) {
            this.html5QrcodeScanner.stop().then(() => {
                this.html5QrcodeScanner = null;
            }).catch(err => console.log(err));
        }
    },

    handleBarcodeScan: function (barcode) {
        // Find item in cache
        const item = this.itemsCache.find(i => i.id === barcode);

        if (!item) {
            alert(`Barang dengan ID ${barcode} tidak ditemukan!`);
            if (this.html5QrcodeScanner) this.html5QrcodeScanner.resume();
            return;
        }

        // Open Transaction Modal
        document.getElementById('transaction-title').textContent = this.currentScanMode === 'IN' ? 'Barang Masuk' : 'Barang Keluar';
        document.getElementById('transaction-title').className = this.currentScanMode === 'IN' ? 'text-green-500 font-bold' : 'text-red-500 font-bold';

        document.getElementById('transaction-item-name').textContent = item.name;
        document.getElementById('transaction-item-stock').textContent = item.stock;

        document.getElementById('transaction-item-id').value = item.id;
        document.getElementById('transaction-type').value = this.currentScanMode;
        document.getElementById('transaction-qty').value = 1;
        document.getElementById('transaction-note').value = '';

        this.showModal('modal-transaction');
    },

    processTransaction: async function (itemId, type, qty, note) {
        const item = this.itemsCache.find(i => i.id === itemId);
        if (!item) return;

        const costPerItem = parseInt(item.cost || 0);
        const pricePerItem = parseInt(item.price || 0);

        let newStock = item.stock;
        let walletDelta = 0; // positive = balance increases, negative = balance decreases

        if (type === 'IN') {
            newStock += qty;
            walletDelta = -(costPerItem * qty); // Spending money to buy stock
        } else {
            if (newStock < qty) {
                alert("Stok tidak mencukupi!");
                return;
            }
            newStock -= qty;
            walletDelta = pricePerItem * qty; // Earning money from selling
        }

        try {
            const batch = this.db.batch();

            // 1. Update item stock
            const itemRef = this.db.collection('items').doc(itemId);
            batch.update(itemRef, { stock: newStock });

            // 2. Record transaction
            const txRef = this.db.collection('transactions').doc();
            batch.set(txRef, {
                itemId: itemId,
                itemName: item.name,
                type: type,
                qty: qty,
                cost: costPerItem,
                price: pricePerItem,
                walletDelta: walletDelta,
                note: note,
                date: new Date().toISOString()
            });

            // 3. Update wallet balance atomically
            const walletRef = this.db.collection('settings').doc('wallet');
            batch.set(walletRef, {
                balance: firebase.firestore.FieldValue.increment(walletDelta)
            }, { merge: true });

            await batch.commit();

            // Update local cache
            item.stock = newStock;

            this.showToast(`Transaksi berhasil: ${type} ${qty} ${item.name}`);
        } catch (e) {
            console.error(e);
            alert("Gagal memproses transaksi");
        }
    },

    // --- BALANCE / KEUANGAN VIEW ---
    renderBalanceView: function () {
        let totalIncome = 0;
        let totalExpense = 0;

        this.transactionsCache.forEach(t => {

            const qty = parseInt(t.qty || 0);
            const price = parseInt(t.price || 0);
            const cost = parseInt(t.cost || 0);

            if (t.type === 'OUT') {

                const amount =
                    (parseInt(t.price || 0) * parseInt(t.qty || 0));

                jenis = 'Penjualan';
                badge = 'badge-in';

                debit =
                    `<span style="color:#4ade80;font-weight:700;">+Rp ${this.formatRp(amount)}</span>`;

                detail =
                    `${t.itemName} × ${t.qty} @ Rp ${this.formatRp(t.price || 0)}`;

            } else if (t.type === 'IN') {

                const amount =
                    (parseInt(t.cost || 0) * parseInt(t.qty || 0));

                jenis = 'Pembelian';
                badge = 'badge-out';

                kredit =
                    `<span style="color:#f87171;font-weight:700;">-Rp ${this.formatRp(amount)}</span>`;

                detail =
                    `${t.itemName} × ${t.qty} @ Rp ${this.formatRp(t.cost || 0)}`;

            } else if (t.type === 'WALLETADJ') {

                const amount = parseInt(
                    t.price ?? t.walletDelta ?? 0
                );

                jenis = 'Tambah Modal';
                badge = 'badge-in';

                debit =
                    `<span style="color:#4ade80;font-weight:700;">+Rp ${this.formatRp(amount)}</span>`;

                detail = t.note || 'Tambah Modal';

            } else {
                return;
            }
        });

        const currentBalance = totalIncome - totalExpense;

        // Update cards
        document.getElementById('balance-current').textContent =
            `Rp ${this.formatRp(currentBalance)}`;

        document.getElementById('balance-income').textContent =
            `Rp ${this.formatRp(totalIncome)}`;

        document.getElementById('balance-expense').textContent =
            `Rp ${this.formatRp(totalExpense)}`;

        // Cashflow table
        const tbody = document.querySelector('#cashflow-table tbody');

        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.transactionsCache.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" class="text-center text-muted">Belum ada arus kas.</td></tr>';
            return;
        }

        this.transactionsCache.forEach(t => {

            let jenis = '';
            let badge = '';
            let debit = '-';
            let kredit = '-';
            let detail = '';

            if (t.type === 'OUT') {

                const amount =
                    (parseInt(t.price || 0) * parseInt(t.qty || 0));

                jenis = 'Penjualan';
                badge = 'badge-in';

                debit =
                    `<span style="color:#4ade80;font-weight:700;">+Rp ${this.formatRp(amount)}</span>`;

                detail =
                    `${t.itemName} × ${t.qty} @ Rp ${this.formatRp(t.price || 0)}`;

            } else if (t.type === 'IN') {

                const amount =
                    (parseInt(t.cost || 0) * parseInt(t.qty || 0));

                jenis = 'Pembelian';
                badge = 'badge-out';

                kredit =
                    `<span style="color:#f87171;font-weight:700;">-Rp ${this.formatRp(amount)}</span>`;

                detail =
                    `${t.itemName} × ${t.qty} @ Rp ${this.formatRp(t.cost || 0)}`;

            } else {
                return;
            }

            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td class="text-xs">
                    ${new Date(t.date).toLocaleString('id-ID')}
                </td>
                <td>
                    <span class="${badge}">
                        ${jenis}
                    </span>
                </td>
                <td>${detail}</td>
                <td>${debit}</td>
                <td>${kredit}</td>
            `;

            tbody.appendChild(tr);
        });
    },
    // --- BLUETOOTH PRINTING ---

    currentPrintData: null,

    openPrintModal: function (id, name, price) {
        document.getElementById('print-item-name').textContent = name;
        document.getElementById('print-item-id').textContent = id;
        document.getElementById('print-item-price').textContent = `Rp ${this.formatRp(price)}`;

        // Generate Barcode SVG
        JsBarcode("#print-barcode-svg", id, {
            format: "CODE128",
            displayValue: true,
            fontSize: 16,
            height: 50,
            background: "#ffffff",
            lineColor: "#000000",
            margin: 0
        });

        this.currentPrintData = { id, name, price };
        this.showModal('modal-print');
    },

    executePrint: async function () {
        if (!navigator.bluetooth) {
            alert("Web Bluetooth API tidak didukung di browser ini. Gunakan Chrome di Android.");
            return;
        }

        const btn = document.getElementById('btn-do-print');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="lucide-loader"></i> Menghubungkan...';
        btn.disabled = true;

        try {
            // Request device
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
                optionalServices: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] // Generic SPP
            }).catch(e => {
                // If specific service filter fails, try generic acceptAll
                return navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
                });
            });

            const server = await device.gatt.connect();

            // Find appropriate service and characteristic (ESC/POS typical)
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb'); // Write without response

            // Prepare ESC/POS Data
            // This is a very simplified ESC/POS generation for demo.
            // Real printing of barcode requires specific ESC/POS barcode commands.
            const encoder = new TextEncoder();

            // Initialize printer: ESC @
            let data = new Uint8Array([0x1B, 0x40]);
            await characteristic.writeValue(data);

            // Text Name
            let text = `${this.currentPrintData.name}\nRp ${this.formatRp(this.currentPrintData.price)}\nID: ${this.currentPrintData.id}\n\n\n`;
            await characteristic.writeValue(encoder.encode(text));

            this.showToast("Berhasil mencetak");
            this.closeModal('modal-print');

        } catch (error) {
            console.error(error);
            alert("Gagal koneksi ke printer: " + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    testPrinter: function () {
        this.currentPrintData = { name: "Test Printer", price: 1000, id: "TEST-123" };
        this.executePrint();
    },

    // --- REPORTS ---

    loadReports: function () {
        const tbody = document.querySelector('#reports-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.transactionsCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Belum ada transaksi</td></tr>';
            return;
        }

        this.transactionsCache.slice(0, 100).forEach(t => {
            const badgeClass = t.type === 'IN' ? 'badge-in' : 'badge-out';

            // Get cost and price with backward compatibility fallback
            const item = this.itemsCache.find(i => i.id === t.itemId);
            const cost = t.cost !== undefined ? t.cost : (item ? (item.cost || 0) : 0);
            const price = t.price !== undefined ? t.price : (item ? (item.price || 0) : 0);
            const qty = t.type === 'WALLETADJ'
                ? 0
                : parseInt(t.qty || 0);

            if (t.type === 'WALLETADJ') {
                profitText = '-';
            }

            // Calculate profit only for OUT transactions
            let profitText = '-';
            let profitClass = '';
            if (t.type === 'OUT') {
                const profit = (price - cost) * parseInt(t.qty);
                profitText = `Rp ${this.formatRp(profit)}`;
                profitClass = profit >= 0 ? 'text-green-600 font-bold' : 'text-danger font-bold';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-mono text-xs">${(t.id || '').substring(0, 8)}</td>
                <td>${new Date(t.date).toLocaleString('id-ID')}</td>
                <td><span class="${badgeClass}">${t.type}</span></td>
                <td>${t.itemName} <br><span class="text-xs text-muted font-mono">${t.itemId}</span></td>
                <td class="font-bold ${t.type === 'IN' ? 'text-green-600' : 'text-danger'}">${t.qty}</td>
                <td>Rp ${this.formatRp(cost)}</td>
                <td>Rp ${this.formatRp(price)}</td>
                <td class="${profitClass}">${profitText}</td>
                <td class="text-sm">${t.note || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    exportCSV: async function () {
        try {
            const snap = await this.db.collection('transactions').orderBy('date', 'desc').get();
            let csvContent = "ID Transaksi,Tanggal,Jenis,ID Barang,Nama Barang,Jumlah,Harga Modal,Harga Jual,Keuntungan,Keterangan\n";

            snap.docs.forEach(doc => {
                const t = doc.data();
                const item = this.itemsCache.find(i => i.id === t.itemId);
                const cost = t.cost !== undefined ? t.cost : (item ? (item.cost || 0) : 0);
                const price = t.price !== undefined ? t.price : (item ? (item.price || 0) : 0);

                let profit = 0;
                if (t.type === 'OUT') {
                    profit = (price - cost) * parseInt(t.qty);
                }

                const row = [
                    doc.id,
                    new Date(t.date).toLocaleString('id-ID'),
                    t.type,
                    t.itemId,
                    t.itemName,
                    t.qty,
                    cost,
                    price,
                    profit,
                    `"${t.note || ''}"`
                ].join(",");
                csvContent += row + "\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Laporan_Inventoris_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showToast("CSV Berhasil di-download");
        } catch (e) {
            console.error(e);
            alert("Gagal export CSV");
        }
    },

    executeTutupBuku: async function () {
        if (!confirm("YAKIN INGIN MENGHAPUS SEMUA TRANSAKSI SEBELUMNYA? Pastikan sudah di-backup/export.")) return;

        try {
            // Delete all transactions (simplified batch delete)
            const snap = await this.db.collection('transactions').get();
            const batchPromises = snap.docs.map(doc => this.db.collection('transactions').doc(doc.id).delete());
            await Promise.all(batchPromises);

            this.showToast("Buku berhasil ditutup. Riwayat dikosongkan.");
            this.closeModal('modal-tutup-buku');
            this.loadReports();
        } catch (e) {
            console.error(e);
            alert("Gagal melakukan tutup buku");
        }
    },

    // --- UTILITIES ---

    showModal: function (id) {
        document.getElementById(id).classList.add('show');
    },

    closeModal: function (id) {
        document.getElementById(id).classList.remove('show');
    },

    showToast: function (msg) {
        const toast = document.getElementById('toast');
        document.getElementById('toast-message').textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    formatRp: function (num) {
        return new Intl.NumberFormat('id-ID').format(num);
    }
};

// Start app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
