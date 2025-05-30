import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, DocumentData } from 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional


// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp(); // if already initialized
}

const db = getFirestore(app);

const useTestResultsFirestore = () => {

  const addTestResult = async (result: any) => {
    try {
      const docRef = await addDoc(collection(db, "testResults"), result);
      console.log("Document written with ID: ", docRef.id);
      return docRef.id;
    } catch (e) {
      console.error("Error adding document: ", e);
      throw e; // Re-throw the error for the calling component to handle
    }
  };

  const getTestResults = async (): Promise<DocumentData[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, "testResults"));
      const results: DocumentData[] = [];
      querySnapshot.forEach((doc) => {
        // doc.data() is never undefined for query doc snapshots
        // console.log(doc.id, " => ", doc.data());
        results.push({ id: doc.id, ...doc.data() });
      });
      return results;
    } catch (e) {
      console.error("Error getting documents: ", e);
      throw e; // Re-throw the error
    }
  };

  return {
    addTestResult,
    getTestResults,
  };
};

export default useTestResultsFirestore;
