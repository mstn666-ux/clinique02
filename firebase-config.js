import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEb97ILEc9ZzK70RAankR-J7orcsUylYk",
  authDomain: "mydatabase-d975e.firebaseapp.com",
  projectId: "mydatabase-d975e",
  storageBucket: "mydatabase-d975e.firebasestorage.app",
  messagingSenderId: "479332981914",
  appId: "1:479332981914:web:afa50a9775d6060ba31323",
  measurementId: "G-ZF43D7E4G4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
