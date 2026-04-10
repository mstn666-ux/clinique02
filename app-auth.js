import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function setStatus(element, message, type = "info") {
  if (!element) return;

  const styles = {
    info: "text-on-surface-variant",
    success: "text-secondary",
    error: "text-error"
  };

  element.className = `text-sm font-medium ${styles[type] || styles.info}`;
  element.textContent = message;
}

function toggleSubmit(button, disabled, label) {
  if (!button) return;
  button.disabled = disabled;
  button.classList.toggle("opacity-70", disabled);
  button.classList.toggle("cursor-not-allowed", disabled);
  if (button.innerHTML && !button.dataset.originalHtml) {
    button.dataset.originalHtml = button.innerHTML;
  }
  if (disabled) {
    button.textContent = "Veuillez patienter...";
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
  }
}

async function saveUserProfile(uid, payload) {
  await setDoc(
    doc(db, "users", uid),
    {
      ...payload,
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

function getFormValue(form, id) {
  return form.querySelector(`#${id}`)?.value.trim() || "";
}

function getQueryRole() {
  return new URLSearchParams(window.location.search).get("role") === "patient"
    ? "patient"
    : "doctor";
}

function getDashboardPath(role) {
  return role === "patient" ? "patient-dashboard.html" : "doctor-dashboard.html";
}

async function handleDoctorSignup(form) {
  const status = document.getElementById("doctor-status");
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prenom = getFormValue(form, "prenom");
    const nom = getFormValue(form, "nom");
    const naissance = getFormValue(form, "naissance");
    const ville = getFormValue(form, "ville");
    const telephone = getFormValue(form, "telephone");
    const email = getFormValue(form, "email");
    const motdepasse = getFormValue(form, "motdepasse");
    const confirmation = getFormValue(form, "confirmation");
    const specialite = getFormValue(form, "specialite");
    const message = getFormValue(form, "message");
    const accepted = form.querySelector('input[type="checkbox"]')?.checked;

    if (!prenom || !nom || !email || !motdepasse || !specialite) {
      setStatus(status, "Veuillez remplir les champs obligatoires.", "error");
      return;
    }

    if (motdepasse.length < 6) {
      setStatus(status, "Le mot de passe doit contenir au moins 6 caracteres.", "error");
      return;
    }

    if (motdepasse !== confirmation) {
      setStatus(status, "La confirmation du mot de passe ne correspond pas.", "error");
      return;
    }

    if (!accepted) {
      setStatus(status, "Veuillez confirmer les informations avant de continuer.", "error");
      return;
    }

    try {
      toggleSubmit(submit, true);
      setStatus(status, "Creation du compte en cours...", "info");

      const credential = await createUserWithEmailAndPassword(auth, email, motdepasse);
      await updateProfile(credential.user, {
        displayName: `${prenom} ${nom}`.trim()
      });

      await saveUserProfile(credential.user.uid, {
        role: "doctor",
        prenom,
        nom,
        fullName: `${prenom} ${nom}`.trim(),
        naissance,
        ville,
        telephone,
        email,
        specialite,
        message
      });

      setStatus(status, "Compte medecin cree avec succes. Vous etes maintenant connecte.", "success");
      window.setTimeout(() => {
        window.location.href = getDashboardPath("doctor");
      }, 1200);
    } catch (error) {
      setStatus(status, getFirebaseMessage(error), "error");
    } finally {
      toggleSubmit(submit, false);
    }
  });
}

async function handlePatientSignup(form) {
  const status = document.getElementById("patient-status");
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prenom = getFormValue(form, "prenom");
    const nom = getFormValue(form, "nom");
    const naissance = getFormValue(form, "naissance");
    const ville = getFormValue(form, "ville");
    const telephone = getFormValue(form, "telephone");
    const email = getFormValue(form, "email");
    const motdepasse = getFormValue(form, "motdepasse");
    const confirmation = getFormValue(form, "confirmation");
    const groupe = getFormValue(form, "groupe");
    const message = getFormValue(form, "message");
    const accepted = form.querySelector('input[type="checkbox"]')?.checked;

    if (!prenom || !nom || !email || !motdepasse || !groupe) {
      setStatus(status, "Veuillez remplir les champs obligatoires.", "error");
      return;
    }

    if (motdepasse.length < 6) {
      setStatus(status, "Le mot de passe doit contenir au moins 6 caracteres.", "error");
      return;
    }

    if (motdepasse !== confirmation) {
      setStatus(status, "La confirmation du mot de passe ne correspond pas.", "error");
      return;
    }

    if (!accepted) {
      setStatus(status, "Veuillez confirmer les informations avant de continuer.", "error");
      return;
    }

    try {
      toggleSubmit(submit, true);
      setStatus(status, "Creation du compte en cours...", "info");

      const credential = await createUserWithEmailAndPassword(auth, email, motdepasse);
      await updateProfile(credential.user, {
        displayName: `${prenom} ${nom}`.trim()
      });

      await saveUserProfile(credential.user.uid, {
        role: "patient",
        prenom,
        nom,
        fullName: `${prenom} ${nom}`.trim(),
        naissance,
        ville,
        telephone,
        email,
        groupeSanguin: groupe,
        message
      });

      setStatus(status, "Compte patient cree avec succes. Vous etes maintenant connecte.", "success");
      window.setTimeout(() => {
        window.location.href = getDashboardPath("patient");
      }, 1200);
    } catch (error) {
      setStatus(status, getFirebaseMessage(error), "error");
    } finally {
      toggleSubmit(submit, false);
    }
  });
}

async function handleLogin(form) {
  const status = document.getElementById("login-status");
  const submit = form.querySelector('button[type="submit"]');
  const expectedRole = getQueryRole();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = getFormValue(form, "email");
    const motdepasse = getFormValue(form, "motdepasse");
    const accepted = form.querySelector('input[type="checkbox"]')?.checked;

    if (!email || !motdepasse) {
      setStatus(status, "Veuillez saisir votre email et votre mot de passe.", "error");
      return;
    }

    if (!accepted) {
      setStatus(status, "Veuillez confirmer les informations avant de continuer.", "error");
      return;
    }

    try {
      toggleSubmit(submit, true);
      setStatus(status, "Connexion en cours...", "info");

      const credential = await signInWithEmailAndPassword(auth, email, motdepasse);
      const snapshot = await getDoc(doc(db, "users", credential.user.uid));
      const profile = snapshot.exists() ? snapshot.data() : null;

      if (!profile?.role) {
        await signOut(auth);
        setStatus(status, "Ce compte n'existe pas dans votre base de donnees.", "error");
        return;
      }

      if (profile.role !== expectedRole) {
        await signOut(auth);
        setStatus(status, "Ce compte n'appartient pas au type d'utilisateur selectionne.", "error");
        return;
      }

      setStatus(status, "Connexion reussie.", "success");
      window.setTimeout(() => {
        window.location.href = getDashboardPath(profile.role);
      }, 1000);
    } catch (error) {
      setStatus(status, getFirebaseMessage(error), "error");
    } finally {
      toggleSubmit(submit, false);
    }
  });
}

function getFirebaseMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Cet email est deja utilise.",
    "auth/invalid-email": "L'adresse email n'est pas valide.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte n'est associe a cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/weak-password": "Le mot de passe est trop faible.",
    "auth/network-request-failed": "Connexion reseau impossible. Verifiez votre internet."
  };

  return messages[error.code] || "Une erreur est survenue. Verifiez la configuration Firebase.";
}

const doctorForm = document.getElementById("doctor-signup-form");
const patientForm = document.getElementById("patient-signup-form");
const loginForm = document.getElementById("login-form");

if (doctorForm) {
  handleDoctorSignup(doctorForm);
}

if (patientForm) {
  handlePatientSignup(patientForm);
}

if (loginForm) {
  handleLogin(loginForm);
}
