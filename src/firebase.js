import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAXmznXOpgQXicNXECgqWmnNe9XwJd6KNY",
  authDomain: "zord-pakistan.firebaseapp.com",
  databaseURL: "https://zord-pakistan-default-rtdb.firebaseio.com",
  projectId: "zord-pakistan",
  storageBucket: "zord-pakistan.firebasestorage.app",
  messagingSenderId: "121241997888",
  appId: "1:121241997888:web:6365c15459232cbddf05a5",
  measurementId: "G-W62HYE71QH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
