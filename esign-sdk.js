// esign-sdk.js

class ESIGNComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    // Fetch attributes from the custom element
    const sessionToken = this.getAttribute("session-token");
    this.devMode = this.hasAttribute("dev-mode");

    // Get optional field values
    this.fields = {
      templateId: this.getAttribute("template-id"),
      fullLegalName: this.getAttribute("full-legal-name"),
      signerEmail: this.getAttribute("signer-email"),
      signerFullName: this.getAttribute("signer-full-name"),
      signerTitle: this.getAttribute("signer-title"),
      address1: this.getAttribute("address-1"),
      address2: this.getAttribute("address-2"),
      city: this.getAttribute("city"),
      state: this.getAttribute("state"),
      zip: this.getAttribute("zip"),
      tin: this.getAttribute("tin"),
    };

    if (!sessionToken) {
      console.error("ESIGNComponent: session-token is required");
      this.renderError("Missing session token");
      return;
    }

    // Decode session details from JWT (for display only)
    const sessionDetails = this.decodeSessionToken(sessionToken);

    // Render initial UI
    this.shadowRoot.innerHTML = `
      <style>
        .esign-container {
          font-family: Arial, sans-serif;
          border: 1px solid #ccc;
          padding: 20px;
          max-width: 500px;
          margin: auto;
          text-align: center;
        }
        .esign-button {
          padding: 10px 20px;
          background-color: #007bff;
          color: #fff;
          border: none;
          cursor: pointer;
        }
        .esign-button:hover {
          background-color: #0056b3;
        }
        .dev-mode-badge {
          background-color: #ffc107;
          color: #000;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 10px;
          display: ${this.devMode ? "inline-block" : "none"};
        }
        .error-message {
          color: #dc3545;
          margin: 10px 0;
        }
        .field-preview {
          text-align: left;
          margin: 10px 0;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 4px;
          font-size: 14px;
        }
        .field-preview h3 {
          margin: 0 0 10px 0;
          font-size: 16px;
        }
        .field-row {
          margin: 5px 0;
        }
        .field-label {
          font-weight: bold;
          color: #666;
        }
      </style>
      <div class="esign-container">
        <div class="dev-mode-badge">Dev Mode</div>
        <p>Ready to sign document ID: ${sessionDetails.documentId}</p>
        ${this.renderFieldPreview()}
        <button class="esign-button" id="start-signing">Start Signing</button>
      </div>
    `;

    // Add click listener for signing button
    this.shadowRoot
      .getElementById("start-signing")
      .addEventListener("click", () => this.startSigning(sessionToken));
  }

  renderFieldPreview() {
    if (!this.devMode) return "";

    const populatedFields = Object.entries(this.fields)
      .filter(([_, value]) => value)
      .map(
        ([key, value]) => `
        <div class="field-row">
          <span class="field-label">${this.formatFieldName(key)}:</span> 
          ${value}
        </div>
      `
      )
      .join("");

    return populatedFields
      ? `
      <div class="field-preview">
        <h3>Template Fields</h3>
        ${populatedFields}
      </div>
    `
      : "";
  }

  formatFieldName(key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/([0-9])/g, " $1");
  }

  // Decode JWT for display purposes only
  decodeSessionToken(token) {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(window.atob(base64));
      return payload;
    } catch (error) {
      console.error("Error decoding session token:", error);
      return { documentId: "Unknown" };
    }
  }

  renderError(message) {
    this.shadowRoot.innerHTML = `
      <div class="esign-container">
        <div class="error-message">${message}</div>
      </div>
    `;
  }

  async startSigning(sessionToken) {
    try {
      let result;

      if (this.devMode) {
        console.log("Dev mode: Mocking signing API call", {
          sessionToken,
          fields: this.fields,
        });
        result = await this.mockSigningProcess();
      } else {
        const response = await fetch("https://your-api.com/sign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            ...this.fields,
            documentId: this.decodeSessionToken(sessionToken).documentId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to initiate signing");
        }

        result = await response.json();
      }

      alert(`Signing completed: ${result.status}`);
    } catch (error) {
      console.error("Error during signing process:", error);
      alert("An error occurred: " + error.message);
    }
  }

  async mockSigningProcess() {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      status: "SUCCESS",
      documentId: this.decodeSessionToken(sessionToken).documentId,
      timestamp: new Date().toISOString(),
      mockData: true,
      fields: this.fields,
    };
  }
}

// Define the custom element
customElements.define("esign-component", ESIGNComponent);
