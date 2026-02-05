import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/functions";
import { firebaseConfig } from "../firebaseConfig";

const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

export const db = app.firestore();
export const storage = app.storage();
export const functions = app.functions("us-central1");
export const auth = app.auth();
export const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
export const timestampFromDate = (date: Date) => firebase.firestore.Timestamp.fromDate(date);
