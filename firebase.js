const firebaseConfig = {
  apiKey: "AIzaSyDqWLQ8df-CBmOrgLEmg38ceD3dZwzuTsk",
  authDomain: "video-98355.firebaseapp.com",
  projectId: "video-98355",
  storageBucket: "video-98355.firebasestorage.app",
  messagingSenderId: "525374326586",
  appId: "1:525374326586:web:e2578b79fad3e29df2f203"
};

// Inisialisasi sekali saja
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // gunakan instance yang sudah ada
}
