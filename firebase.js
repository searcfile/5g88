// ⚠️ Ganti hanya nilai di bawah sesuai project kamu
const firebaseConfig = {
  apiKey: "AIzaSyDqWLQ8df-CBmOrgLEmg38ceD3dZwzuTsk",
  authDomain: "video-98355.firebaseapp.com",
  projectId: "video-98355",
  // WAJIB untuk Realtime Database:
  databaseURL: "https://video-98355-default-rtdb.asia-southeast1.firebasedatabase.app",
  // Storage bucket yang benar:
  storageBucket: "video-98355.appspot.com",
  messagingSenderId: "525374326586",
  appId: "1:525374326586:web:e2578b79fad3e29df2f203"
};

// Init sekali
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app();
}
console.log('Firebase apps length =', firebase.apps.length);
