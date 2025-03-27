// --- Dark Mode Logic (remains the same) ---
const themeToggle = document.getElementById('theme-checkbox');
const themeLabel = document.querySelector('.theme-label');

function applyTheme(theme) { /* ... function code ... */
    if (theme === 'dark') { document.body.classList.add('dark-mode'); if (themeToggle) themeToggle.checked = true; if (themeLabel) themeLabel.textContent = 'Light Mode'; } else { document.body.classList.remove('dark-mode'); if (themeToggle) themeToggle.checked = false; if (themeLabel) themeLabel.textContent = 'Dark Mode'; }
}
const storedTheme = localStorage.getItem('theme'); const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; const initialTheme = storedTheme || (systemPrefersDark ? 'dark' : 'light'); applyTheme(initialTheme);
if (themeToggle) { themeToggle.addEventListener('change', () => { const newTheme = themeToggle.checked ? 'dark' : 'light'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }); }
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => { if (!localStorage.getItem('theme')) { const newSystemTheme = event.matches ? 'dark' : 'light'; applyTheme(newSystemTheme); } });
// --- End Dark Mode Logic ---


// --- Global State ---
let currentUserUID = null;
let currentUserIDToken = null; // Store the ID token

// --- Utility Function for Showing Messages (remains the same) ---
function showMessage(messageText, containerId = 'message', isSuccess = false) { /* ... function code ... */
    const messageContainer = document.getElementById(containerId); const authMessageContainer = document.querySelector('#auth-container #message'); let targetContainer = messageContainer; if (!targetContainer && authMessageContainer && containerId === 'message') { targetContainer = authMessageContainer; } if (!targetContainer) { console.warn("Message container not found:", containerId); return; } targetContainer.textContent = messageText; targetContainer.className = 'message-area'; targetContainer.classList.toggle('success', isSuccess); targetContainer.style.display = 'block'; setTimeout(() => { let currentContainer = document.getElementById(containerId); if (!currentContainer && authMessageContainer && containerId === 'message') { currentContainer = authMessageContainer; } if (currentContainer && currentContainer.textContent === messageText) { currentContainer.textContent = ''; currentContainer.style.display = 'none'; currentContainer.className = 'message-area'; } }, 5000);
}

// --- Logout Function ---
// Define handleLogout early as it might be needed by getIdToken
function handleLogout() {
    firebase.auth().signOut().then(() => {
        console.log("Client-side Logout successful.");
        // showMessage is defined above
        showMessage("Logged out successfully. Redirecting...", 'message', true);
        // onAuthStateChanged will handle the redirect.
    }).catch((error) => {
        console.error("Logout Error:", error);
        showMessage("Error logging out.", 'message');
    });
}

// *** MOVED getIdToken Definition HERE (Before onAuthStateChanged) ***
// Centralized function to get the current ID token
async function getIdToken() {
    const user = firebase.auth().currentUser;
    // console.log("getIdToken: Current user:", user); // Debug Log
    if (user) {
        try {
            const forceRefresh = false; // Set true to test if expired token is issue
            currentUserIDToken = await user.getIdToken(forceRefresh);
            // console.log("getIdToken: Token retrieved:", currentUserIDToken ? 'Yes (truncated: ' + currentUserIDToken.substring(0, 10) + '...)' : 'No'); // Debug Log
            return currentUserIDToken;
        } catch (error) {
            console.error("Error getting ID token:", error);
            handleLogout(); // Ensure handleLogout is defined before this line
            return null;
        }
    }
    // console.log("getIdToken: No user logged in."); // Debug Log
    return null; // No user logged in
}

// --- Helper for Backend Fetch Requests (Adds Auth Header - requires getIdToken) ---
// Define fetchWithAuth after getIdToken and handleLogout
async function fetchWithAuth(url, options = {}) {
    const token = await getIdToken(); // Get fresh token
    if (!token) {
        console.error("Cannot fetch: No user token available."); showMessage("Authentication error. Please log in again.", "message"); handleLogout(); throw new Error("User not authenticated or token unavailable.");
    }
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
    if ((options.method === 'POST' || options.method === 'PUT') && !options.headers['Content-Type'] && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }
    // console.log("fetchWithAuth: Sending request to", url, "with headers:", options.headers); // Debug Log
    return fetch(url, options);
}


// --- Observe Auth State Changes (Now after function definitions) ---
const pageLoadingIndicator = document.getElementById('page-loading-indicator');

firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        currentUserUID = user.uid;
        console.log("Auth State Changed: User logged in:", currentUserUID); // Line 16 (approx after move)
        sessionStorage.setItem('userUID', currentUserUID);

        await getIdToken(); // Line 18 (approx after move) - Should now be defined

        // Hide page loader and show content on dashboard
        if (window.location.pathname.includes('dashboard.html')) {
             if (pageLoadingIndicator) { pageLoadingIndicator.style.display = 'none'; }
             document.querySelectorAll('.content-hidden').forEach(el => { el.style.display = ''; el.classList.remove('content-hidden'); });
        }

        // Redirect logic or load data
        if (window.location.pathname.endsWith('/') || window.location.pathname.endsWith('index.html')) {
             console.log("User logged in, redirecting to dashboard...");
             window.location.href = 'dashboard.html';
        } else if (document.getElementById('recipe-list') && typeof loadRecipes === 'function') {
             // Check if already on dashboard page before calling loadRecipes
             if (window.location.pathname.includes('dashboard.html')) {
                loadRecipes();
             }
        }

    } else {
        // User is signed out.
        console.log("Auth State Changed: User logged out.");
        currentUserUID = null; currentUserIDToken = null; sessionStorage.removeItem('userUID');
        if (pageLoadingIndicator) { pageLoadingIndicator.style.display = 'none'; }

        // Redirect logic
        if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('index.html')) {
             console.log("User logged out, redirecting to index...");
             window.location.href = 'index.html';
        }
    }
});

// --- Authentication Forms (Login/Signup - require showMessage) ---
const signupForm = document.getElementById('signup-form');
if (signupForm) { /* signup event listener remains the same */
     signupForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('signup-email').value; const password = document.getElementById('signup-password').value; const button = signupForm.querySelector('button[type="submit"]'); button.disabled = true; showMessage('Signing up...', 'message'); try { const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password); console.log("Client-side Signup successful:", userCredential.user.uid); } catch (error) { console.error("Client-side Signup error:", error.code, error.message); let friendlyMessage = 'An error occurred during signup.'; switch (error.code) { case 'auth/email-already-in-use': friendlyMessage = 'This email address is already in use.'; break; case 'auth/invalid-email': friendlyMessage = 'Please enter a valid email address.'; break; case 'auth/weak-password': friendlyMessage = 'Password should be at least 6 characters long.'; break; } showMessage(friendlyMessage, 'message'); button.disabled = false; } });
}
const loginForm = document.getElementById('login-form');
if (loginForm) { /* login event listener remains the same */
    loginForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('login-email').value; const password = document.getElementById('login-password').value; const button = loginForm.querySelector('button[type="submit"]'); button.disabled = true; showMessage('Logging in...', 'message'); try { const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password); console.log("Client-side Login successful:", userCredential.user.uid); } catch (error) { console.error("Client-side Login error:", error.code, error.message); let friendlyMessage = 'An error occurred during login.'; switch (error.code) { case 'auth/user-not-found': case 'auth/wrong-password': case 'auth/invalid-credential': friendlyMessage = 'Invalid email or password.'; break; case 'auth/invalid-email': friendlyMessage = 'Please enter a valid email address.'; break; case 'auth/user-disabled': friendlyMessage = 'This account has been disabled.'; break; } showMessage(friendlyMessage, 'message'); button.disabled = false; } });
 }

// --- Logout Button (requires handleLogout) ---
const logoutButton = document.getElementById('logout-button');
if (logoutButton) { logoutButton.addEventListener('click', handleLogout); }


// --- Dashboard Logic (requires fetchWithAuth, showMessage) ---
const addRecipeForm = document.getElementById('add-recipe-form');
if (addRecipeForm) { /* add recipe listener remains the same */
    addRecipeForm.addEventListener('submit', async (e) => { e.preventDefault(); const recipeName = document.getElementById('recipe-name').value; const ingredients = document.getElementById('ingredients-list').value; const instructions = document.getElementById('instructions').value; if (!recipeName || !ingredients || !instructions) { showMessage('Please fill in all recipe fields.', 'message'); return; } const options = { method: 'POST', body: JSON.stringify({ recipeName, ingredients, instructions }) }; try { const response = await fetchWithAuth('/recipes', options); if (response.ok) { showMessage('Recipe added successfully!', 'message', true); addRecipeForm.reset(); loadRecipes(); } else { let errorMsg = 'Failed to add recipe.'; try { const data = await response.json(); errorMsg = data.error || errorMsg; } catch (e) {} showMessage(errorMsg, 'message'); } } catch (error) { console.error("Error adding recipe:", error); if (error.message !== "User not authenticated or token unavailable.") { showMessage('An error occurred while adding the recipe.', 'message'); }} });
}
async function loadRecipes() { /* loadRecipes logic remains the same (using spinner) */
    const recipeList = document.getElementById('recipe-list'); if (!recipeList) return; if (!currentUserUID) { recipeList.innerHTML = '<p>Authenticating...</p>'; return; } recipeList.innerHTML = '<div class="spinner"></div>'; try { const response = await fetchWithAuth(`/recipes`); recipeList.innerHTML = ''; if (response.ok) { const recipes = await response.json(); if (recipes.length === 0) { recipeList.innerHTML = '<p>No recipes found...</p>'; } else { recipes.forEach(recipe => { const recipeItem=document.createElement('div'); recipeItem.classList.add('recipe-item'); recipeItem.dataset.recipeId=recipe.id; const recipeHeader=document.createElement('div'); recipeHeader.classList.add('recipe-header'); const nameEl=document.createElement('h3'); nameEl.textContent=recipe.recipeName; nameEl.classList.add('recipe-name-display'); const buttonContainer=document.createElement('div'); buttonContainer.classList.add('recipe-action-buttons'); const editButton=document.createElement('button'); editButton.classList.add('edit-button','button-secondary'); editButton.dataset.id=recipe.id; editButton.textContent='Edit'; const deleteButton=document.createElement('button'); deleteButton.classList.add('delete-button'); deleteButton.dataset.id=recipe.id; deleteButton.textContent='Delete'; buttonContainer.appendChild(editButton); buttonContainer.appendChild(deleteButton); recipeHeader.appendChild(nameEl); recipeHeader.appendChild(buttonContainer); const ingredientsEl=document.createElement('p'); ingredientsEl.classList.add('recipe-ingredients-display'); ingredientsEl.innerHTML='<strong>Ingredients:</strong> '; ingredientsEl.appendChild(document.createTextNode(recipe.ingredients||'N/A')); const instructionsEl=document.createElement('p'); instructionsEl.classList.add('recipe-instructions-display'); instructionsEl.innerHTML='<strong>Instructions:</strong> '; instructionsEl.appendChild(document.createTextNode(recipe.instructions||'N/A')); const progressBarContainer=document.createElement('div'); progressBarContainer.classList.add('delete-progress-container'); progressBarContainer.style.display='none'; progressBarContainer.innerHTML=`<div class="delete-progress-bar" style="width: 0%;"></div>`; recipeItem.appendChild(recipeHeader); recipeItem.appendChild(ingredientsEl); recipeItem.appendChild(instructionsEl); recipeItem.appendChild(progressBarContainer); recipeList.appendChild(recipeItem); });} addDeleteButtonListeners(); addEditButtonListeners(); } else { let errorMsg='Failed to load recipes.'; try {const data=await response.json(); errorMsg=data.error||errorMsg;} catch(e){} showMessage(errorMsg,'message'); recipeList.innerHTML = `<p style="color: var(--error-text);">${errorMsg}</p>`;} } catch(error){ recipeList.innerHTML = ''; console.error("Error loading recipes:",error); if(error.message!=="User not authenticated or token unavailable."){showMessage("An error occurred while loading recipes",'message'); recipeList.innerHTML = '<p style="color: var(--error-text);">An error occurred loading recipes.</p>';}}
}
let deleteProgressIntervals = {};
function addDeleteButtonListeners() { /* addDeleteButtonListeners remains the same */
    const deleteButtons=document.querySelectorAll('.delete-button'); deleteButtons.forEach(button=>{if(button.dataset.listenerAttachedDelete)return; button.dataset.listenerAttachedDelete='true'; button.addEventListener('click',async (event)=>{const recipeId=event.target.dataset.id; const clickedButton=event.target; const recipeItem=clickedButton.closest('.recipe-item'); const progressContainer=recipeItem?.querySelector('.delete-progress-container'); const progressBar=recipeItem?.querySelector('.delete-progress-bar'); const editButton=recipeItem?.querySelector('.edit-button'); clickedButton.disabled=true; if(editButton)editButton.disabled=true; if(progressContainer&&progressBar){progressBar.style.width='0%'; progressContainer.style.display='block'; let currentProgress=0; const estimatedTimeMs=1500; const intervalTimeMs=50; const totalSteps=estimatedTimeMs/intervalTimeMs; const increment=100/totalSteps; if(deleteProgressIntervals[recipeId]) clearInterval(deleteProgressIntervals[recipeId]); deleteProgressIntervals[recipeId]=setInterval(()=>{currentProgress+=increment; let displayProgress=Math.min(currentProgress,100); progressBar.style.width=displayProgress+'%'; if(currentProgress>=100){clearInterval(deleteProgressIntervals[recipeId]); delete deleteProgressIntervals[recipeId];}},intervalTimeMs);}else{clickedButton.textContent='Deleting...';} try {const response=await fetchWithAuth(`/recipes/${recipeId}`,{method:'DELETE'}); if(response.ok){showMessage('Recipe deleted successfully!','message',true); loadRecipes();}else{let errorMsg=`Failed to delete recipe. Status: ${response.status}`; try{if(response.headers.get("content-type")?.includes("application/json")){const data=await response.json(); errorMsg=data.error||errorMsg;}else{const textResponse=await response.text(); errorMsg=`${errorMsg} - ${textResponse||response.statusText}`;}}catch(e){errorMsg=`${errorMsg} (Error reading server response)`;} showMessage(errorMsg,'message'); if(progressContainer)progressContainer.style.display='none'; clickedButton.disabled=false; if(editButton)editButton.disabled=false; if(!progressContainer||!progressBar)clickedButton.textContent='Delete';}}catch(error){console.error("Network/other error deleting recipe:",error); if(error.message!=="User not authenticated or token unavailable."){showMessage("An error occurred while deleting the recipe",'message');} if(progressContainer)progressContainer.style.display='none'; clickedButton.disabled=false; if(editButton)editButton.disabled=false; if(!progressContainer||!progressBar)clickedButton.textContent='Delete';} finally {if(deleteProgressIntervals[recipeId]){clearInterval(deleteProgressIntervals[recipeId]); delete deleteProgressIntervals[recipeId];}}});});
}
function addEditButtonListeners() { /* addEditButtonListeners remains the same */
    const editButtons=document.querySelectorAll('.edit-button'); editButtons.forEach(button=>{if(button.dataset.listenerAttachedEdit)return; button.dataset.listenerAttachedEdit='true'; button.addEventListener('click',(event)=>{const recipeId=event.target.dataset.id; const recipeItem=event.target.closest('.recipe-item'); if(!recipeItem)return; const header=recipeItem.querySelector('.recipe-header'); const nameDisplay=recipeItem.querySelector('.recipe-name-display'); const ingredientsDisplay=recipeItem.querySelector('.recipe-ingredients-display'); const instructionsDisplay=recipeItem.querySelector('.recipe-instructions-display'); const buttonContainer=recipeItem.querySelector('.recipe-action-buttons'); const editButton=buttonContainer?.querySelector('.edit-button'); const deleteButton=buttonContainer?.querySelector('.delete-button'); if(!header||!nameDisplay||!ingredientsDisplay||!instructionsDisplay||!buttonContainer||!editButton||!deleteButton){console.error("Elements missing for editing:",recipeId); showMessage("Error preparing edit.",'message'); return;} const originalName=nameDisplay.textContent; const originalIngredients=ingredientsDisplay.textContent.replace(/^Ingredients:\s*/,'').trim(); const originalInstructions=instructionsDisplay.textContent.replace(/^Instructions:\s*/,'').trim(); nameDisplay.style.display='none'; const nameInput=document.createElement('input'); nameInput.type='text'; nameInput.value=originalName; nameInput.classList.add('edit-recipe-name','form-control-edit'); header.insertBefore(nameInput,buttonContainer); ingredientsDisplay.style.display='none'; const ingredientsTextarea=document.createElement('textarea'); ingredientsTextarea.value=originalIngredients; ingredientsTextarea.classList.add('edit-recipe-ingredients','form-control-edit'); ingredientsTextarea.rows=4; recipeItem.insertBefore(ingredientsTextarea,instructionsDisplay); instructionsDisplay.style.display='none'; const instructionsTextarea=document.createElement('textarea'); instructionsTextarea.value=originalInstructions; instructionsTextarea.classList.add('edit-recipe-instructions','form-control-edit'); instructionsTextarea.rows=6; recipeItem.insertBefore(instructionsTextarea,recipeItem.querySelector('.delete-progress-container')); const saveButton=document.createElement('button'); saveButton.textContent='Save Changes'; saveButton.classList.add('save-changes-button','button-primary'); saveButton.dataset.id=recipeId; const cancelButton=document.createElement('button'); cancelButton.textContent='Cancel'; cancelButton.classList.add('cancel-edit-button','button-secondary'); cancelButton.dataset.id=recipeId; editButton.style.display='none'; deleteButton.style.display='none'; buttonContainer.appendChild(saveButton); buttonContainer.appendChild(cancelButton); saveButton.addEventListener('click',async ()=>{const newName=nameInput.value.trim(); const newIngredients=ingredientsTextarea.value.trim(); const newInstructions=instructionsTextarea.value.trim(); if(!newName||!newIngredients||!newInstructions){showMessage('Fields cannot be empty.','message'); return;} saveButton.disabled=true; cancelButton.disabled=true; saveButton.textContent='Saving...'; try {const response=await fetchWithAuth(`/recipes/${recipeId}`,{method:'PUT',body:JSON.stringify({recipeName:newName,ingredients:newIngredients,instructions:newInstructions})}); if(response.ok){showMessage('Recipe updated!','message',true); loadRecipes();}else{let errorMsg=`Update failed: ${response.status}`; try{if(response.headers.get("content-type")?.includes("application/json")){const data=await response.json(); errorMsg=data.error||errorMsg;}else{const textResponse=await response.text(); errorMsg=`${errorMsg} - ${textResponse||response.statusText}`;}}catch(e){} showMessage(errorMsg,'message'); saveButton.disabled=false; cancelButton.disabled=false; saveButton.textContent='Save Changes';}}catch(error){console.error("Error updating recipe:",error); if(error.message!=="User not authenticated or token unavailable."){showMessage('Error saving changes.','message');} saveButton.disabled=false; cancelButton.disabled=false; saveButton.textContent='Save Changes';}}); cancelButton.addEventListener('click',()=>{nameInput.remove(); ingredientsTextarea.remove(); instructionsTextarea.remove(); nameDisplay.style.display=''; ingredientsDisplay.style.display=''; instructionsDisplay.style.display=''; saveButton.remove(); cancelButton.remove(); editButton.style.display=''; deleteButton.style.display='';});});});
}

// --- Help Page Logic (requires fetchWithAuth, showMessage, parsing functions) ---
const generateButton = document.getElementById('generate-button'); /* Variables remain same */ const progressContainerHelp = document.getElementById('progress-container'); const progressBarHelp = document.getElementById('progress-bar'); const progressTextHelp = document.getElementById('progress-text'); const generatedRecipeContainer = document.getElementById('generated-recipe-container'); const generatedRecipeDiv = document.getElementById('generated-recipe'); const saveGeneratedRecipeButton = document.getElementById('save-recipe-button'); let progressIntervalIdHelp = null; let generatedRecipeData = null;
if (generateButton && progressContainerHelp && progressBarHelp && progressTextHelp && generatedRecipeDiv && generatedRecipeContainer && saveGeneratedRecipeButton) { /* generate button listener remains same */
    generateButton.addEventListener('click', async () => { /* Progress bar and UI reset logic same */ const ingredientsInput = document.getElementById('ingredients-input'); const ingredients = ingredientsInput.value.split(',').map(s => s.trim()).filter(s => s !== ''); if(ingredients.length===0){showMessage('Please enter ingredients.','message'); return;} generatedRecipeDiv.textContent=''; generatedRecipeContainer.style.display='none'; showMessage('','message'); generatedRecipeData=null; saveGeneratedRecipeButton.style.display='none'; progressBarHelp.style.width='0%'; progressTextHelp.textContent='0%'; progressContainerHelp.style.display='block'; generateButton.disabled=true; let currentProgress=0; const estimatedTimeMs=12000; const intervalTimeMs=100; const totalSteps=estimatedTimeMs/intervalTimeMs; const increment=100/totalSteps; if(progressIntervalIdHelp) clearInterval(progressIntervalIdHelp); progressIntervalIdHelp=setInterval(()=>{currentProgress+=increment; let displayProgress=Math.min(currentProgress,99); progressBarHelp.style.width=displayProgress+'%'; progressTextHelp.textContent=Math.round(displayProgress)+'%'; if(currentProgress>=99){clearInterval(progressIntervalIdHelp); progressIntervalIdHelp=null;}},intervalTimeMs); try { const response = await fetchWithAuth('/generate-recipe', { method: 'POST', body: JSON.stringify({ ingredients }) }); const data = await response.json(); if(progressIntervalIdHelp){clearInterval(progressIntervalIdHelp); progressIntervalIdHelp=null;} if(response.ok&&data.recipe){ generatedRecipeDiv.textContent=data.recipe; generatedRecipeContainer.style.display='block'; saveGeneratedRecipeButton.style.display='block'; generatedRecipeData={recipeName:getRecipeName(data.recipe),ingredients:getIngredients(data.recipe),instructions:getInstructions(data.recipe)}; console.log("Parsed Generated Recipe:",generatedRecipeData); progressBarHelp.style.width='100%'; progressTextHelp.textContent='100%'; setTimeout(()=>{if(progressContainerHelp.style.display!=='none'){progressContainerHelp.style.display='none';}},1500); } else { showMessage(data.error||data.message||`Failed to generate recipe (Status: ${response.status})`,'message'); progressContainerHelp.style.display='none'; generatedRecipeContainer.style.display='none'; saveGeneratedRecipeButton.style.display='none'; } } catch(error){console.error("Error generating recipe:",error); if(progressIntervalIdHelp){clearInterval(progressIntervalIdHelp); progressIntervalIdHelp=null;} if(error.message!=="User not authenticated or token unavailable."){showMessage('An error occurred while generating the recipe.','message');} progressContainerHelp.style.display='none'; generatedRecipeContainer.style.display='none'; saveGeneratedRecipeButton.style.display='none'; } finally { generateButton.disabled=false; } });
} else if (window.location.pathname.includes('help.html')) { /* Warning remains same */ console.warn("One or more elements for recipe generation missing."); }
function getRecipeName(recipeText) { /* ... remains same ... */ if (!recipeText) return "Generated Recipe"; const match = recipeText.match(/^(?:(?:Recipe )?Name:|Title:)?\s*(.+?)\s*(?:\n\n|\nIngredients:|\nInstructions:|$)/im); return match && match[1].trim() ? match[1].trim() : "Generated Recipe"; }
function getIngredients(recipeText) { /* ... remains same ... */ if (!recipeText) return ""; const match = recipeText.match(/Ingredients:\s*\n?([\s\S]*?)(?:\n\nInstructions:|\nInstructions:|\n\nDirections:|\nDirections:|$)/i); return match && match[1] ? match[1].replace(/^Ingredients:\s*\n?/i, '').trim().replace(/^(-|\*)\s*/gm, '').split('\n').map(line => line.trim()).filter(line => line).join('\n') : ""; }
function getInstructions(recipeText) { /* ... remains same ... */ if (!recipeText) return ""; const match = recipeText.match(/(?:Instructions:|Directions:)\s*\n?([\s\S]*?)$/i); return match && match[1] ? match[1].replace(/^(?:Instructions:|Directions:)\s*\n?/i, '').trim().split('\n').map(line => line.trim()).filter(line => line).join('\n') : ""; }
if (saveGeneratedRecipeButton) { /* save generated recipe listener remains same */
    saveGeneratedRecipeButton.addEventListener('click', async () => { if(!generatedRecipeData||!generatedRecipeData.recipeName||generatedRecipeData.recipeName==="Generated Recipe"||!generatedRecipeData.ingredients||!generatedRecipeData.instructions){showMessage('Could not parse recipe details.','message'); console.log("Problematic generatedRecipeData:",generatedRecipeData); return;} saveGeneratedRecipeButton.disabled=true; showMessage('Saving recipe...','message'); try { const response = await fetchWithAuth('/recipes', { method: 'POST', body: JSON.stringify({ recipeName: generatedRecipeData.recipeName, ingredients: generatedRecipeData.ingredients, instructions: generatedRecipeData.instructions }) }); if(response.ok){ showMessage('Recipe saved! Redirecting...','message',true); generatedRecipeData=null; if(generatedRecipeDiv)generatedRecipeDiv.textContent=''; if(generatedRecipeContainer)generatedRecipeContainer.style.display='none'; saveGeneratedRecipeButton.style.display='none'; setTimeout(()=>{window.location.href='dashboard.html';},2000); } else { let errorMsg='Failed to save recipe.'; try {const data=await response.json(); errorMsg=data.error||errorMsg;}catch(e){} showMessage(errorMsg,'message'); saveGeneratedRecipeButton.disabled=false; } } catch(error){ console.error('Error saving recipe:',error); if(error.message!=="User not authenticated or token unavailable."){showMessage('An error occurred while saving the recipe.','message');} saveGeneratedRecipeButton.disabled=false; } });
}

// --- Global Help Button Redirect (requires specific element) ---
const helpButton = document.getElementById('help-button');
if (helpButton) { helpButton.addEventListener('click', () => { window.location.href = 'help.html'; }); }