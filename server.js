require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
// *** CHANGED HERE: Import cert instead of applicationDefault ***
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path'); // Optional: Helper for path joining

const app = express();
const port = process.env.PORT || 3000;

const upload = multer();

// --- Firebase Admin SDK Initialization (MODIFIED) ---

// *** ADDED HERE: Define the path to your service account key ***
// Make sure this path is correct relative to where you run `node server.js`
// If serviceAccountKey.json is in the SAME directory as server.js:
const serviceAccountPath = path.join(__dirname, './serviceAccountKey.json');
// If it's in a different directory, adjust the path accordingly, e.g.:
// const serviceAccountPath = path.join(__dirname, 'config', 'serviceAccountKey.json');

try {
    // *** CHANGED HERE: Use cert() with the path ***
    initializeApp({
        credential: cert(serviceAccountPath)
    });
    console.log("Firebase Admin SDK Initialized Successfully using service account file.");
} catch (error) {
    console.error("Firebase Admin SDK Initialization Error:", error);
    // Consider exiting if Firebase Admin fails to initialize, as most features will break
    process.exit(1);
}
const auth = getAuth();
const db = getFirestore();
// --- End Firebase Admin SDK ---

// --- Gemini AI Initialization (remains the same) ---
const geminiApiKey = process.env.GEMINI_API_KEY;
let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("GoogleGenerativeAI Initialized.");
} else {
    console.warn("Warning: GEMINI_API_KEY environment variable not set. AI features will be disabled.");
}
// --- End Gemini AI ---

// --- Core Middleware (remains the same) ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public')); // Make sure your HTML/CSS/JS are in a 'public' folder
// --- End Core Middleware ---

// --- Authentication Middleware (remains the same) ---
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Auth token missing or malformed:', req.path);
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token.' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        req.user = { uid: decodedToken.uid };
        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error.code, error.message);
        if (error.code == 'auth/id-token-expired') {
             return res.status(401).json({ error: 'Unauthorized: Token expired.' });
        }
        // Crucial: Log the actual error but return a generic message for security
        return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
    }
};
// --- End Authentication Middleware ---

// --- Recipe Routes (Protected - remain the same) ---
app.post('/recipes', verifyFirebaseToken, upload.none(), async (req, res) => { /* POST /recipes logic same */
    try { const uid = req.user.uid; const { recipeName, ingredients, instructions } = req.body; if (!recipeName || !ingredients || !instructions) { return res.status(400).json({ error: 'Missing required fields.' }); } const recipeData = { userId: uid, recipeName, ingredients, instructions, timestamp: new Date()}; const docRef = await db.collection('recipes').add(recipeData); console.log(`Recipe ${docRef.id} added by ${uid}`); res.status(201).json({ message: 'Recipe added!', id: docRef.id, ...recipeData }); } catch (error) { console.error("Error adding recipe:", error); res.status(500).json({ error: 'Failed to add recipe. ' + error.message }); }
});
app.get('/recipes', verifyFirebaseToken, async (req, res) => { /* GET /recipes logic same */
    try { const uid = req.user.uid; const recipesSnapshot = await db.collection('recipes').where('userId', '==', uid).orderBy('timestamp', 'desc').get(); const recipes = []; recipesSnapshot.forEach(doc => { recipes.push({ id: doc.id, ...doc.data() }); }); console.log(`Workspaceed ${recipes.length} recipes for ${uid}`); res.status(200).json(recipes); } catch (error) { console.error("Error getting recipes:", error); res.status(500).json({ error: 'Failed to retrieve recipes. ' + error.message }); }
});
app.put('/recipes/:id', verifyFirebaseToken, upload.none(), async (req, res) => { /* PUT /recipes/:id logic same */
    try { const recipeId = req.params.id; const uid = req.user.uid; const { recipeName, ingredients, instructions, removeImage } = req.body; if (!recipeId) { return res.status(400).json({ error: 'Recipe ID missing.' }); } if (!recipeName || !ingredients || !instructions) { return res.status(400).json({ error: 'Missing required fields.' }); } const recipeRef = db.collection('recipes').doc(recipeId); const recipeDoc = await recipeRef.get(); if (!recipeDoc.exists) { return res.status(404).json({ error: 'Recipe not found.' }); } if (recipeDoc.data().userId !== uid) { return res.status(403).json({ error: 'Forbidden.' }); } const updatedData = { recipeName, ingredients, instructions, lastUpdated: new Date() }; /* TODO: Image logic */ await recipeRef.update(updatedData); console.log(`Recipe ${recipeId} updated by ${uid}`); res.status(200).json({ message: 'Recipe updated!', id: recipeId }); } catch (error) { console.error("Error updating recipe:", error); res.status(500).json({ error: 'Failed to update recipe. ' + error.message }); }
});
app.delete('/recipes/:id', verifyFirebaseToken, async (req, res) => { /* DELETE /recipes/:id logic same */
    try { const { id } = req.params; const uid = req.user.uid; if (!id) { return res.status(400).json({ error: 'Recipe ID required.' }); } const recipeRef = db.collection('recipes').doc(id); const recipe = await recipeRef.get(); if (!recipe.exists) { return res.status(404).json({ error: 'Recipe not found.' }); } if (recipe.data().userId !== uid) { return res.status(403).json({ error: 'Forbidden.' }); } /* TODO: Image Deletion */ await recipeRef.delete(); console.log(`Recipe ${id} deleted by ${uid}`); res.status(204).send(); } catch (error) { console.error("Error deleting recipe:", error); res.status(500).json({ error: 'Failed to delete recipe. ' + error.message }); }
});

// --- Gemini AI Integration (Protected - remains the same) ---
app.post('/generate-recipe', verifyFirebaseToken, async (req, res) => { /* /generate-recipe logic same */
    if (!genAI) { return res.status(503).json({ error: 'AI Service unavailable.' }); }
    try { const { ingredients } = req.body; if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) { return res.status(400).json({ error: 'Ingredients array required.' }); } const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest"}); const prompt = `Create a simple recipe using ONLY the following ingredients: ${ingredients.join(', ')}. If a reasonable recipe cannot be made, clearly state that. Format the response clearly with:\nRecipe Name: [Name]\nIngredients:\n- [Quantity/Amount] [Ingredient Name]\n- ...\nInstructions:\n1. [Step 1]\n2. ...`; console.log(`User ${req.user.uid} sending prompt to Gemini`); const result = await model.generateContent(prompt); const response = await result.response; const text = response.text(); console.log("Received response from Gemini."); res.status(200).json({ recipe: text }); } catch (error) { console.error("Error generating recipe with Gemini:", error); res.status(500).json({ error: 'Failed to generate recipe using AI. ' + error.message }); }
});

// --- Root and Error Handling (remains the same) ---
app.get('/', (req, res) => { res.send('Recipe App Backend is running!'); });
app.use((req, res, next) => { res.status(404).send(`Cannot ${req.method} ${req.path}`); });
app.use((err, req, res, next) => { console.error("Unhandled Error:", err.stack || err); res.status(500).json({ error: 'Something went wrong on the server!' }); });

app.listen(port, () => { /* listen logic same */
    console.log(`Server listening on http://localhost:${port}`);
    // No longer need GOOGLE_APPLICATION_CREDENTIALS warning if loading directly
    // if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) { console.warn("Warning: GOOGLE_APPLICATION_CREDENTIALS env var not set."); }
    if (!geminiApiKey) { console.warn("Warning: GEMINI_API_KEY env var not set."); }
});