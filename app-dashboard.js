import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const dashboardRoot = document.getElementById("dashboard-root");

if (!dashboardRoot) {
  // No dashboard on this page.
} else {
  const expectedRole = dashboardRoot.dataset.role;
  const loading = document.getElementById("dashboard-loading");
  const errorBox = document.getElementById("dashboard-error");
  const logoutButton = document.getElementById("logout-button");
  const serviceForm = document.getElementById("doctor-service-form");
  const bookingForm = document.getElementById("patient-booking-form");
  const appointmentsContainer = document.getElementById("doctor-appointments-list");
  const patientRequestsContainer = document.getElementById("patient-requests-list");
  const doctorServicesContainer = document.getElementById("doctor-services-list");
  const patientServicesContainer = document.getElementById("patient-services-list");
  const patientServiceSelect = document.getElementById("patient-service-select");
  const patientSlotSelect = document.getElementById("patient-slot-select");
  const patientSlotButtons = document.getElementById("patient-slot-buttons");
  const doctorSlotInput = document.getElementById("service-slot-input");
  const doctorSlotAddButton = document.getElementById("service-slot-add");
  const doctorSlotList = document.getElementById("doctor-slot-list");
  const accountPanel = document.getElementById("account-panel");
  const accountPanelToggle = document.getElementById("account-panel-toggle");
  const accountPanelClose = document.getElementById("account-panel-close");

  let currentUser = null;
  let currentProfile = null;
  let publishedServices = [];
  let doctorSlotDraft = [];

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value || "-";
    }
  }

  function setBoxMessage(id, message, type = "info") {
    const element = document.getElementById(id);
    if (!element) return;

    const tones = {
      info: "text-on-surface-variant",
      success: "text-secondary",
      error: "text-error"
    };

    element.className = `text-sm font-medium ${tones[type] || tones.info}`;
    element.textContent = message;
  }

  function getDashboardErrorMessage(error, fallback) {
    const messages = {
      "permission-denied": "La reservation est bloquee par les regles Firestore. Mettez a jour vos rules.",
      "failed-precondition": "Une configuration Firebase manque pour terminer cette action.",
      "unavailable": "Service temporairement indisponible. Reessayez dans un instant."
    };

    return messages[error?.code] || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parseSlots(rawValue) {
    return rawValue
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeSlot(slot) {
    return (slot || "").trim();
  }

  function fillProfile(profile, user) {
    setText("profile-name", profile.fullName || `${profile.prenom || ""} ${profile.nom || ""}`.trim());
    setText("profile-email", profile.email || user.email || "-");
    setText("profile-phone", profile.telephone || "-");
    setText("profile-city", profile.ville || "-");
    setText("profile-birth", profile.naissance || "-");
    setText("doctor-specialite", profile.specialite || "-");
    setText("doctor-message", profile.message || "Aucun message enregistre.");
    setText("patient-blood", profile.groupeSanguin || "-");
    setText("patient-message", profile.message || "Aucune demande enregistree.");

    const doctorPrenom = document.getElementById("service-prenom");
    const doctorNom = document.getElementById("service-nom");
    const doctorSpecialite = document.getElementById("service-specialite");
    const patientPrenom = document.getElementById("booking-prenom");
    const patientNom = document.getElementById("booking-nom");
    const patientTelephone = document.getElementById("booking-telephone");

    if (doctorPrenom) doctorPrenom.value = profile.prenom || "";
    if (doctorNom) doctorNom.value = profile.nom || "";
    if (doctorSpecialite) doctorSpecialite.value = profile.specialite || "";
    if (patientPrenom) patientPrenom.value = profile.prenom || "";
    if (patientNom) patientNom.value = profile.nom || "";
    if (patientTelephone) patientTelephone.value = profile.telephone || "";
  }

  function bindAccountPanel() {
    if (!accountPanel || !accountPanelToggle || !accountPanelClose || accountPanel.dataset.bound === "true") return;

    accountPanel.dataset.bound = "true";

    function openPanel() {
      accountPanel.classList.remove("hidden");
      document.body.classList.add("overflow-hidden");
    }

    function closePanel() {
      accountPanel.classList.add("hidden");
      document.body.classList.remove("overflow-hidden");
    }

    accountPanelToggle.addEventListener("click", openPanel);
    accountPanelClose.addEventListener("click", closePanel);

    accountPanel.addEventListener("click", (event) => {
      if (event.target === accountPanel) {
        closePanel();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !accountPanel.classList.contains("hidden")) {
        closePanel();
      }
    });
  }

  function renderDoctorServices(services) {
    if (!doctorServicesContainer) return;

    if (!services.length) {
      doctorServicesContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-3xl p-6 text-on-surface-variant">
          Aucune prestation publiee pour le moment.
        </div>
      `;
      return;
    }

    doctorServicesContainer.innerHTML = services
      .map((service) => {
        const slots = (service.availableSlots || [])
          .map((slot) => `<span class="px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-container text-xs font-semibold">${escapeHtml(slot)}</span>`)
          .join(" ");

        return `
          <div class="bg-surface-container-low rounded-3xl p-6 space-y-4">
            <div>
              <p class="text-sm text-on-surface-variant">Medecin</p>
              <p class="text-xl font-bold text-primary">${escapeHtml(service.doctorFullName || "-")}</p>
            </div>
            <div class="grid sm:grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-on-surface-variant">Specialite</p>
                <p class="font-semibold text-primary">${escapeHtml(service.specialite || "-")}</p>
              </div>
              <div>
                <p class="text-sm text-on-surface-variant">Jours de travail</p>
                <p class="font-semibold text-primary">${escapeHtml(service.workDays || "-")}</p>
              </div>
            </div>
            <div>
              <p class="text-sm text-on-surface-variant mb-2">Creneaux disponibles</p>
              <div class="flex flex-wrap gap-2">${slots || '<span class="text-on-surface-variant">Aucun creneau</span>'}</div>
            </div>
            <div class="pt-1">
              <button class="px-5 py-2 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold hover:bg-red-100 transition-colors inline-flex items-center gap-2" data-doctor-delete-service="${service.id}" type="button">
                Supprimer la prestation
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderDoctorAppointments(appointments) {
    if (!appointmentsContainer) return;

    if (!appointments.length) {
      appointmentsContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-3xl p-6 text-on-surface-variant">
          Aucun rendez-vous recu pour le moment.
        </div>
      `;
      return;
    }

    appointmentsContainer.innerHTML = appointments
      .map((item) => {
        const statusTone =
          item.status === "accepted"
            ? "bg-emerald-100 text-emerald-700"
            : item.status === "rejected"
              ? "bg-red-100 text-red-700"
              : "bg-primary-fixed text-primary";

        const actions =
          item.status === "pending"
            ? `
                <div class="flex flex-wrap gap-3 mt-4">
                  <button class="px-5 py-2 rounded-full bg-emerald-600 text-white font-semibold" data-action="accept" data-appointment-id="${item.id}" type="button">Accepter</button>
                  <button class="px-5 py-2 rounded-full bg-red-100 text-red-700 font-semibold" data-action="reject" data-appointment-id="${item.id}" type="button">Refuser</button>
                  <button class="px-5 py-2 rounded-full border border-outline-variant bg-surface text-on-surface font-semibold hover:bg-surface-container-high transition-colors inline-flex items-center gap-2" data-action="delete" data-appointment-id="${item.id}" type="button">Supprimer de la liste</button>
                </div>
              `
            : `
                <div class="flex flex-wrap gap-3 mt-4">
                  <button class="px-5 py-2 rounded-full border border-outline-variant bg-surface text-on-surface font-semibold hover:bg-surface-container-high transition-colors inline-flex items-center gap-2" data-action="delete" data-appointment-id="${item.id}" type="button">Supprimer de la liste</button>
                </div>
              `;

        return `
          <div class="bg-surface-container-low rounded-3xl p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xl font-bold text-primary">${escapeHtml(item.patientFullName || "-")}</p>
                <p class="text-on-surface-variant">${escapeHtml(item.maladie || "Sans motif precise")}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusTone}">${escapeHtml(item.status || "pending")}</span>
            </div>
            <div class="grid md:grid-cols-3 gap-4 mt-5">
              <div>
                <p class="text-sm text-on-surface-variant">Telephone</p>
                <p class="font-semibold text-primary">${escapeHtml(item.patientPhone || "-")}</p>
              </div>
              <div>
                <p class="text-sm text-on-surface-variant">Creneau choisi</p>
                <p class="font-semibold text-primary">${escapeHtml(item.selectedSlot || "-")}</p>
              </div>
              <div>
                <p class="text-sm text-on-surface-variant">Description</p>
                <p class="font-semibold text-primary">${escapeHtml(item.description || "Aucune description")}</p>
              </div>
            </div>
            ${actions}
          </div>
        `;
      })
      .join("");
  }

  function renderPatientServices(services) {
    if (!patientServicesContainer) return;

    if (!services.length) {
      patientServicesContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-3xl p-6 text-on-surface-variant">
          Aucune prestation n'est encore disponible.
        </div>
      `;
      return;
    }

    patientServicesContainer.innerHTML = services
      .map((service) => {
        const slots = (service.availableSlots || [])
          .map((slot) => `<span class="px-3 py-1 rounded-full bg-primary-fixed text-primary text-xs font-semibold">${escapeHtml(slot)}</span>`)
          .join(" ");

        return `
          <div class="bg-surface-container-low rounded-3xl p-6 space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="text-xl font-bold text-primary">${escapeHtml(service.doctorFullName || "-")}</p>
                <p class="text-on-surface-variant">${escapeHtml(service.specialite || "-")}</p>
              </div>
              <span class="px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-container text-xs font-bold uppercase">Disponible</span>
            </div>
            <div>
              <p class="text-sm text-on-surface-variant">Jours de travail</p>
              <p class="font-semibold text-primary">${escapeHtml(service.workDays || "-")}</p>
            </div>
            <div>
              <p class="text-sm text-on-surface-variant mb-2">Horaires proposes</p>
              <div class="flex flex-wrap gap-2">${slots || '<span class="text-on-surface-variant">Aucun horaire</span>'}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderPatientRequests(requests) {
    if (!patientRequestsContainer) return;

    if (!requests.length) {
      patientRequestsContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-3xl p-6 text-on-surface-variant">
          Aucune reservation envoyee pour le moment.
        </div>
      `;
      return;
    }

    patientRequestsContainer.innerHTML = requests
      .map((item) => {
        const statusTone =
          item.status === "accepted"
            ? "bg-emerald-100 text-emerald-700"
            : item.status === "rejected"
              ? "bg-red-100 text-red-700"
              : "bg-primary-fixed text-primary";

        return `
          <div class="bg-surface-container-low rounded-3xl p-6 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xl font-bold text-primary">${escapeHtml(item.doctorName || "-")}</p>
                <p class="text-on-surface-variant">${escapeHtml(item.specialite || "-")}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusTone}">${escapeHtml(item.status || "pending")}</span>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <div>
                <p class="text-sm text-on-surface-variant">Creneau</p>
                <p class="font-semibold text-primary">${escapeHtml(item.selectedSlot || "-")}</p>
              </div>
              <div>
                <p class="text-sm text-on-surface-variant">Maladie</p>
                <p class="font-semibold text-primary">${escapeHtml(item.maladie || "-")}</p>
              </div>
              <div>
                <p class="text-sm text-on-surface-variant">Description</p>
                <p class="font-semibold text-primary">${escapeHtml(item.description || "Aucune description")}</p>
              </div>
            </div>
            <div class="pt-1">
              <button class="px-5 py-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold hover:bg-amber-100 transition-colors inline-flex items-center gap-2" data-patient-delete="${item.id}" type="button">
                Annuler la demande
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function updateSlotOptions() {
    if (!patientServiceSelect || !patientSlotSelect || !patientSlotButtons) return;

    const selectedService = publishedServices.find(
      (service) => service.id === patientServiceSelect.value
    );

    if (!selectedService) {
      patientSlotButtons.innerHTML = `
        <div class="bg-surface-container-low rounded-xl px-4 py-3 text-on-surface-variant">
          Choisissez d'abord un service pour afficher les horaires.
        </div>
      `;
      return;
    }

    const options = selectedService?.availableSlots || [];
    patientSlotSelect.value = "";

    if (!options.length) {
      patientSlotButtons.innerHTML = `
        <div class="bg-surface-container-low rounded-xl px-4 py-3 text-on-surface-variant">
          Aucun horaire disponible pour ce service.
        </div>
      `;
      return;
    }

    patientSlotButtons.innerHTML = options
      .map((slot) => (
        `<button class="slot-option px-4 py-3 rounded-xl bg-surface-container-low text-primary font-semibold text-left transition-all hover:bg-primary-fixed" data-slot-value="${escapeHtml(slot)}" type="button">${escapeHtml(slot)}</button>`
      ))
      .join("");
  }

  function updateServiceOptions() {
    if (!patientServiceSelect) return;

    patientServiceSelect.innerHTML = [
      '<option value="">Choisissez un medecin / service</option>',
      ...publishedServices.map((service) => (
        `<option value="${service.id}">${escapeHtml(service.doctorFullName)} - ${escapeHtml(service.specialite || "")}</option>`
      ))
    ].join("");

    updateSlotOptions();
  }

  function renderDoctorSlotDraft() {
    if (!doctorSlotList) return;

    if (!doctorSlotDraft.length) {
      doctorSlotList.innerHTML = `
        <span class="text-sm text-on-surface-variant">Aucun horaire ajoute pour le moment.</span>
      `;
      return;
    }

    doctorSlotList.innerHTML = doctorSlotDraft
      .map((slot) => (
        `<button class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-fixed text-primary font-semibold" data-remove-slot="${escapeHtml(slot)}" type="button">${escapeHtml(slot)} <span aria-hidden="true">x</span></button>`
      ))
      .join("");
  }

  function bindDoctorSlotBuilder() {
    if (!doctorSlotInput || !doctorSlotAddButton || doctorSlotAddButton.dataset.bound === "true") return;

    doctorSlotAddButton.dataset.bound = "true";

    function addSlot() {
      const slot = normalizeSlot(doctorSlotInput.value);
      if (!slot) return;
      if (!doctorSlotDraft.includes(slot)) {
        doctorSlotDraft.push(slot);
        doctorSlotDraft.sort();
        renderDoctorSlotDraft();
      }
      doctorSlotInput.value = "";
    }

    doctorSlotAddButton.addEventListener("click", addSlot);
    doctorSlotInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addSlot();
      }
    });

    doctorSlotList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-slot]");
      if (!button) return;
      doctorSlotDraft = doctorSlotDraft.filter((slot) => slot !== button.dataset.removeSlot);
      renderDoctorSlotDraft();
    });

    renderDoctorSlotDraft();
  }

  function bindDoctorServiceForm() {
    if (!serviceForm || serviceForm.dataset.bound === "true") return;

    serviceForm.dataset.bound = "true";
    const statusId = "doctor-service-status";
    bindDoctorSlotBuilder();

    serviceForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const prenom = serviceForm.querySelector("#service-prenom")?.value.trim() || "";
      const nom = serviceForm.querySelector("#service-nom")?.value.trim() || "";
      const workDays = serviceForm.querySelector("#service-workdays")?.value.trim() || "";
      const specialite = serviceForm.querySelector("#service-specialite")?.value.trim() || "";
      const slots = [...doctorSlotDraft];

      if (!prenom || !nom || !workDays || !specialite || !slots.length) {
        setBoxMessage(statusId, "Veuillez remplir tous les champs de la prestation.", "error");
        return;
      }

      try {
        setBoxMessage(statusId, "Publication de la prestation en cours...", "info");

        await addDoc(collection(db, "services"), {
          doctorUid: currentUser.uid,
          doctorPrenom: prenom,
          doctorNom: nom,
          doctorFullName: `${prenom} ${nom}`.trim(),
          workDays,
          specialite,
          availableSlots: slots,
          isActive: true,
          createdAt: serverTimestamp()
        });

        setBoxMessage(statusId, "Prestation publiee avec succes.", "success");
        serviceForm.querySelector("#service-workdays").value = "";
        doctorSlotDraft = [];
        renderDoctorSlotDraft();
      } catch (error) {
        setBoxMessage(statusId, getDashboardErrorMessage(error, "Impossible de publier la prestation."), "error");
      }
    });
  }

  function bindPatientBookingForm() {
    if (!bookingForm || bookingForm.dataset.bound === "true") return;

    bookingForm.dataset.bound = "true";
    const statusId = "patient-booking-status";

    if (patientServiceSelect) {
      patientServiceSelect.addEventListener("change", updateSlotOptions);
    }

    patientSlotButtons?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot-value]");
      if (!button) return;

      patientSlotSelect.value = button.dataset.slotValue || "";

      patientSlotButtons.querySelectorAll("[data-slot-value]").forEach((item) => {
        item.classList.remove("bg-primary", "text-white", "shadow-lg");
        item.classList.add("bg-surface-container-low", "text-primary");
      });

      button.classList.remove("bg-surface-container-low", "text-primary");
      button.classList.add("bg-primary", "text-white", "shadow-lg");
    });

    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const serviceId = patientServiceSelect?.value || "";
      const selectedSlot = patientSlotSelect?.value || "";
      const prenom = bookingForm.querySelector("#booking-prenom")?.value.trim() || "";
      const nom = bookingForm.querySelector("#booking-nom")?.value.trim() || "";
      const telephone = bookingForm.querySelector("#booking-telephone")?.value.trim() || "";
      const maladie = bookingForm.querySelector("#booking-maladie")?.value.trim() || "";
      const description = bookingForm.querySelector("#booking-description")?.value.trim() || "";
      const selectedService = publishedServices.find((service) => service.id === serviceId);

      if (!selectedService || !selectedSlot || !prenom || !nom || !telephone || !maladie) {
        setBoxMessage(statusId, "Veuillez remplir les champs obligatoires et choisir un horaire.", "error");
        return;
      }

      try {
        setBoxMessage(statusId, "Envoi de la demande en cours...", "info");

        const serviceRef = doc(db, "services", selectedService.id);
        const appointmentRef = doc(collection(db, "appointments"));

        await runTransaction(db, async (transaction) => {
          const serviceSnapshot = await transaction.get(serviceRef);

          if (!serviceSnapshot.exists()) {
            throw new Error("service-missing");
          }

          const serviceData = serviceSnapshot.data();
          const availableSlots = serviceData.availableSlots || [];

          if (!availableSlots.includes(selectedSlot)) {
            throw new Error("slot-unavailable");
          }

          transaction.update(serviceRef, {
            availableSlots: availableSlots.filter((slot) => slot !== selectedSlot)
          });

          transaction.set(appointmentRef, {
            doctorUid: selectedService.doctorUid,
            doctorName: selectedService.doctorFullName,
            specialite: selectedService.specialite,
            serviceId: selectedService.id,
            selectedSlot,
            patientUid: currentUser.uid,
            patientPrenom: prenom,
            patientNom: nom,
            patientFullName: `${prenom} ${nom}`.trim(),
            patientPhone: telephone,
            maladie,
            description,
            status: "pending",
            createdAt: serverTimestamp()
          });
        });

        setBoxMessage(statusId, "Votre demande de rendez-vous a ete envoyee.", "success");
        bookingForm.querySelector("#booking-maladie").value = "";
        bookingForm.querySelector("#booking-description").value = "";
        if (patientSlotSelect) patientSlotSelect.value = "";
        updateSlotOptions();
      } catch (error) {
        const message =
          error?.message === "slot-unavailable"
            ? "Ce creneau vient d'etre reserve. Veuillez en choisir un autre."
            : getDashboardErrorMessage(error, "Impossible d'envoyer la demande.");
        setBoxMessage(statusId, message, "error");
      }
    });
  }

  function bindDoctorServiceActions() {
    if (!doctorServicesContainer || doctorServicesContainer.dataset.bound === "true") return;

    doctorServicesContainer.dataset.bound = "true";
    doctorServicesContainer.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-doctor-delete-service]");
      if (!button) return;

      const serviceId = button.dataset.doctorDeleteService;
      if (!serviceId) return;

      try {
        setBoxMessage("doctor-service-status", "Suppression de la prestation en cours...", "info");

        await runTransaction(db, async (transaction) => {
          const serviceRef = doc(db, "services", serviceId);
          const serviceSnapshot = await transaction.get(serviceRef);

          if (!serviceSnapshot.exists()) {
            throw new Error("service-missing");
          }

          const serviceData = serviceSnapshot.data();
          if (serviceData.doctorUid !== currentUser.uid) {
            throw new Error("not-owner");
          }

          transaction.delete(serviceRef);
        });

        setBoxMessage("doctor-service-status", "La prestation a ete supprimee avec succes.", "success");
      } catch (error) {
        setBoxMessage(
          "doctor-service-status",
          getDashboardErrorMessage(error, "Impossible de supprimer cette prestation."),
          "error"
        );
      }
    });
  }

  async function deleteAppointmentEntry(appointmentId, actor) {
    await runTransaction(db, async (transaction) => {
      const appointmentRef = doc(db, "appointments", appointmentId);
      const appointmentSnapshot = await transaction.get(appointmentRef);

      if (!appointmentSnapshot.exists()) {
        throw new Error("appointment-missing");
      }

      const appointmentData = appointmentSnapshot.data();

      if (actor === "patient" && appointmentData.patientUid !== currentUser.uid) {
        throw new Error("not-owner");
      }

      if (actor === "doctor" && appointmentData.doctorUid !== currentUser.uid) {
        throw new Error("not-owner");
      }

      const serviceRef = doc(db, "services", appointmentData.serviceId);
      const serviceSnapshot = await transaction.get(serviceRef);

      if (serviceSnapshot.exists()) {
        const serviceData = serviceSnapshot.data();
        const updatedSlots = [...(serviceData.availableSlots || [])];

        if (!updatedSlots.includes(appointmentData.selectedSlot)) {
          updatedSlots.push(appointmentData.selectedSlot);
          updatedSlots.sort();
          transaction.update(serviceRef, {
            availableSlots: updatedSlots
          });
        }
      }

      transaction.delete(appointmentRef);
    });
  }

  function bindPatientRequestActions() {
    if (!patientRequestsContainer || patientRequestsContainer.dataset.bound === "true") return;

    patientRequestsContainer.dataset.bound = "true";
    patientRequestsContainer.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-patient-delete]");
      if (!button) return;

      const appointmentId = button.dataset.patientDelete;
      if (!appointmentId) return;

      try {
        setBoxMessage("patient-requests-status", "Annulation de la demande en cours...", "info");
        await deleteAppointmentEntry(appointmentId, "patient");
        setBoxMessage("patient-requests-status", "La demande a ete annulee avec succes.", "success");
      } catch (error) {
        setBoxMessage(
          "patient-requests-status",
          getDashboardErrorMessage(error, "Impossible d'annuler cette demande."),
          "error"
        );
      }
    });
  }

  function bindAppointmentActions() {
    if (!appointmentsContainer || appointmentsContainer.dataset.bound === "true") return;

    appointmentsContainer.dataset.bound = "true";
    appointmentsContainer.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const appointmentId = button.dataset.appointmentId;
      const action = button.dataset.action;
      if (!appointmentId || !action) return;

      try {
        if (action === "delete") {
          setBoxMessage("doctor-appointments-status", "Suppression du rendez-vous en cours...", "info");
          await deleteAppointmentEntry(appointmentId, "doctor");
          setBoxMessage("doctor-appointments-status", "Le rendez-vous a ete supprime de la liste.", "success");
          return;
        }

        const appointmentRef = doc(db, "appointments", appointmentId);

        await runTransaction(db, async (transaction) => {
          const appointmentSnapshot = await transaction.get(appointmentRef);
          if (!appointmentSnapshot.exists()) {
            throw new Error("appointment-missing");
          }

          const appointmentData = appointmentSnapshot.data();
          const serviceRef = doc(db, "services", appointmentData.serviceId);

          if (appointmentData.doctorUid !== currentUser.uid) {
            throw new Error("not-owner");
          }

          transaction.update(appointmentRef, {
            status: action === "accept" ? "accepted" : "rejected",
            updatedAt: serverTimestamp()
          });

          if (action === "reject") {
            const serviceSnapshot = await transaction.get(serviceRef);
            if (serviceSnapshot.exists()) {
              const serviceData = serviceSnapshot.data();
              const updatedSlots = [...(serviceData.availableSlots || [])];
              if (!updatedSlots.includes(appointmentData.selectedSlot)) {
                updatedSlots.push(appointmentData.selectedSlot);
                updatedSlots.sort();
              }
              transaction.update(serviceRef, {
                availableSlots: updatedSlots
              });
            }
          }
        });

      } catch (error) {
        setBoxMessage("doctor-appointments-status", getDashboardErrorMessage(error, "Impossible de mettre a jour ce rendez-vous."), "error");
      }
    });
  }

  async function startDoctorStreams() {
    bindDoctorServiceForm();
    bindDoctorServiceActions();
    bindAppointmentActions();

    onSnapshot(query(collection(db, "services"), where("doctorUid", "==", currentUser.uid)), (snapshot) => {
      const services = snapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      renderDoctorServices(services);
    });

    onSnapshot(query(collection(db, "appointments"), where("doctorUid", "==", currentUser.uid)), (snapshot) => {
      const appointments = snapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      renderDoctorAppointments(appointments);
    });
  }

  async function startPatientStreams() {
    bindPatientBookingForm();
    bindPatientRequestActions();

    onSnapshot(query(collection(db, "services"), where("isActive", "==", true)), (snapshot) => {
      publishedServices = snapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      renderPatientServices(publishedServices);
      updateServiceOptions();
    });

    onSnapshot(query(collection(db, "appointments"), where("patientUid", "==", currentUser.uid)), (snapshot) => {
      const requests = snapshot.docs
        .map((docItem) => ({ id: docItem.id, ...docItem.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      renderPatientRequests(requests);
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = `login.html?role=${expectedRole}`;
    });
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = `login.html?role=${expectedRole}`;
      return;
    }

    currentUser = user;

    try {
      const snapshot = await getDoc(doc(db, "users", user.uid));
      const profile = snapshot.exists() ? snapshot.data() : null;

      if (!profile?.role || profile.role !== expectedRole) {
        await signOut(auth);
        window.location.href = `login.html?role=${expectedRole}`;
        return;
      }

      currentProfile = profile;
      fillProfile(profile, user);
      bindAccountPanel();

      if (expectedRole === "doctor") {
        await startDoctorStreams();
      } else {
        await startPatientStreams();
      }

      if (loading) loading.classList.add("hidden");
      dashboardRoot.classList.remove("hidden");
    } catch (error) {
      if (loading) loading.classList.add("hidden");
      if (errorBox) {
        errorBox.textContent = "Impossible de charger vos donnees. Verifiez Firebase et reessayez.";
        errorBox.classList.remove("hidden");
      }
    }
  });
}
