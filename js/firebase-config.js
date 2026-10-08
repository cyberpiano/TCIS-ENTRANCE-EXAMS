/**
 * TCIS Entrance Examination Portal - Official Firebase Project Integration
 * Project ID: tcis-b5133
 */

(function () {
    // Official Live Firebase Project Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyAkegcM2lxooOBxachwiVZTD3CrnU57Y5w",
        authDomain: "tcis-b5133.firebaseapp.com",
        projectId: "tcis-b5133",
        storageBucket: "tcis-b5133.firebasestorage.app",
        messagingSenderId: "178505069120",
        appId: "1:178505069120:web:e21ba55d01f65192a965a5",
        measurementId: "G-49FCPPJKVF"
    };

    let firebaseApp = null;
    let auth = null;
    let db = null;
    let storage = null;
    let analytics = null;

    // Initialize Firebase SDK if compat library is present
    if (typeof firebase !== 'undefined') {
        try {
            if (!firebase.apps.length) {
                firebaseApp = firebase.initializeApp(firebaseConfig);
            } else {
                firebaseApp = firebase.app();
            }
            auth = firebase.auth();
            db = firebase.firestore();
            storage = firebase.storage();
            if (firebase.analytics) {
                analytics = firebase.analytics();
            }
            console.log("🔥 TCIS Firebase (tcis-b5133) initialized successfully!");
        } catch (err) {
            console.warn("Firebase Init notice:", err);
        }
    }

    // Default System Settings Configuration
    const DEFAULT_SETTINGS = {
        schoolName: "TCIS (The Comprehensive International School)",
        schoolEmail: "admissions@tcis.edu",
        schoolLogo: "/TCIS-Logo.png",
        brevoApiKey: "",
        brevoSenderEmail: "admissions@tcis.edu",
        imgbbApiKey: "5104290486754c55f073a408415e8ddb",
        resultVisibility: "Immediately",
        violationThresholds: {
            fullscreenExit: 1,
            tabSwitch: 1,
            cameraUnavailable: 2,
            maxViolationsAutoSubmit: 5
        },
        gradingScale: [
            { minScore: 80, maxScore: 100, grade: 'A', status: 'PASS' },
            { minScore: 70, maxScore: 79, grade: 'B', status: 'PASS' },
            { minScore: 60, maxScore: 69, grade: 'C', status: 'PASS' },
            { minScore: 50, maxScore: 59, grade: 'D', status: 'PASS' },
            { minScore: 0, maxScore: 49, grade: 'F', status: 'FAIL' }
        ],
        imageRetentionDays: 30
    };

    // Client Persistence DB Engine with Firebase Firestore Synchronization
    class TCISStore {
        constructor() {
            this.storageKey = 'tcis_portal_db_v1';
            this.initStore();
            // Create a promise that resolves when Firestore sync completes
            this.syncReady = new Promise(resolve => {
                this.syncWithFirestore(resolve);
            });
        }

        initStore() {
            if (!localStorage.getItem(this.storageKey)) {
                const seedData = this.generateSeedData();
                localStorage.setItem(this.storageKey, JSON.stringify(seedData));
            }
        }

        getStore() {
            try {
                return JSON.parse(localStorage.getItem(this.storageKey)) || {};
            } catch (e) {
                const seed = this.generateSeedData();
                localStorage.setItem(this.storageKey, JSON.stringify(seed));
                return seed;
            }
        }

        saveStore(data) {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        }

        getCollection(collectionName) {
            const store = this.getStore();
            return store[collectionName] || [];
        }

        saveCollection(collectionName, items) {
            const store = this.getStore();
            store[collectionName] = items;
            this.saveStore(store);

            // Sync collection item to Firestore if connected
            if (db) {
                try {
                    items.forEach(item => {
                        const docId = item.id || item.studentId || item.adminId || item.code;
                        if (docId) {
                            db.collection(collectionName).doc(String(docId)).set(item, { merge: true })
                                .catch(e => console.warn("Firestore background sync note:", e));
                        }
                    });
                } catch (e) {
                    console.warn("Firestore sync error:", e);
                }
            }
        }

        getItem(collectionName, idKey, idValue) {
            const items = this.getCollection(collectionName);
            return items.find(item => item[idKey] === idValue) || null;
        }

        upsertItem(collectionName, idKey, itemData) {
            const items = this.getCollection(collectionName);
            const index = items.findIndex(item => item[idKey] === itemData[idKey]);
            const now = new Date().toISOString();
            
            if (index >= 0) {
                items[index] = { ...items[index], ...itemData, updatedAt: now };
            } else {
                items.push({ ...itemData, createdAt: now, updatedAt: now });
            }
            
            this.saveCollection(collectionName, items);

            // Directly push document to Firestore
            if (db && itemData[idKey]) {
                try {
                    db.collection(collectionName).doc(String(itemData[idKey])).set(itemData, { merge: true });
                } catch (e) {
                    console.warn("Firestore upsert note:", e);
                }
            }
            return itemData;
        }

        deleteItem(collectionName, idKey, idValue) {
            let items = this.getCollection(collectionName);
            items = items.filter(item => item[idKey] !== idValue);
            this.saveCollection(collectionName, items);

            if (db) {
                try {
                    db.collection(collectionName).doc(String(idValue)).delete();
                } catch (e) {
                    console.warn("Firestore delete note:", e);
                }
            }
        }

        async clearAllData() {
            // 1. Clear LocalStorage
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem('tcis_portal_store');

            // 2. Clear Cloud Firestore documents
            if (db) {
                const collections = ['students', 'examinations', 'questionBank', 'subjects', 'results', 'settings', 'admins', 'examAssignments', 'examSessions', 'answers', 'monitoringSessions', 'violations', 'emailLogs', 'auditLogs'];
                for (const col of collections) {
                    try {
                        const snapshot = await db.collection(col).get();
                        if (!snapshot.empty) {
                            const batch = db.batch();
                            snapshot.docs.forEach(doc => batch.delete(doc.ref));
                            await batch.commit();
                        }
                    } catch (e) {
                        console.warn(`Firestore clear error for ${col}:`, e);
                    }
                }
            }

            // 3. Re-initialize seed data in local store
            const seedData = this.generateSeedData();
            localStorage.setItem(this.storageKey, JSON.stringify(seedData));
        }

        async clearCollection(col) {
            const store = this.getStore();
            store[col] = [];
            this.saveStore(store);

            if (db) {
                try {
                    const snapshot = await db.collection(col).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                    }
                } catch (e) {
                    console.warn(`Firestore clearCollection error for ${col}:`, e);
                }
            }
        }

        // Pull latest documents from Firestore into local cache on init
        syncWithFirestore(onReady) {
            if (!db) {
                if (onReady) onReady();
                return;
            }
            const collections = ['students', 'examinations', 'questionBank', 'subjects', 'results', 'settings', 'admins', 'examAssignments'];
            let pending = collections.length;

            const done = () => {
                pending--;
                if (pending <= 0 && onReady) onReady();
            };

            collections.forEach(col => {
                db.collection(col).get().then(snapshot => {
                    if (!snapshot.empty) {
                        const docs = [];
                        snapshot.forEach(doc => docs.push(doc.data()));
                        if (docs.length > 0) {
                            const store = this.getStore();
                            if (col === 'settings') {
                                // Settings is an object or array of 1
                                store[col] = docs[0] || docs;
                            } else {
                                // Safely merge by document id so locally created items are preserved
                                const localItems = Array.isArray(store[col]) ? store[col] : [];
                                const idKey = (col === 'students') ? 'studentId' :
                                              (col === 'admins') ? 'adminId' :
                                              (col === 'examinations' || col === 'questionBank' || col === 'subjects') ? 'id' : 'id';
                                
                                const itemMap = new Map();
                                // Add local items first
                                localItems.forEach(item => {
                                    const id = item[idKey] || item.id || item.code;
                                    if (id) itemMap.set(String(id), item);
                                });
                                // Merge Firestore docs (Firestore updates/overrides, preserving any local-only items)
                                docs.forEach(doc => {
                                    const id = doc[idKey] || doc.id || doc.code;
                                    if (id) itemMap.set(String(id), doc);
                                });
                                store[col] = Array.from(itemMap.values());
                            }
                            this.saveStore(store);
                        }
                    }
                    done();
                }).catch(err => {
                    console.warn(`Firestore read fallback for ${col}:`, err);
                    done();
                });
            });
        }

        generateSeedData() {
            return {
                settings: DEFAULT_SETTINGS,
                admins: [
                    {
                        adminId: "ADMIN-001",
                        email: "admin@tcis.edu",
                        passwordHash: "admin123",
                        name: "System Administrator",
                        role: "SuperAdmin"
                    }
                ],
                subjects: [],
                students: [],
                questionBank: [],
                examinations: [],
                examAssignments: [],
                examSessions: [],
                answers: [],
                results: [],
                monitoringSessions: [],
                violations: [],
                emailLogs: [],
                auditLogs: []
            };
        }
    }

    // Expose global database store interface & Firebase SDK references
    window.TCISFirebaseConfig = firebaseConfig;
    window.TCISFirebaseApp = firebaseApp;
    window.TCISAuthInstance = auth;
    window.TCISFirestoreInstance = db;
    window.TCISStorageInstance = storage;
    window.TCISDB = new TCISStore();
})();
