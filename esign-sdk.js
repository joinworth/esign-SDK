// esign-sdk.js

class ESIGNComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    // Fetch attributes from the custom element
    const apiKey = this.getAttribute("api-key");
    const documentId = this.getAttribute("document-id");
    // Add dev-mode attribute
    this.devMode = this.hasAttribute("dev-mode");

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
      </style>
      <div class="esign-container">
        <div class="dev-mode-badge">Dev Mode</div>
        <p>Ready to sign document ID: ${documentId}</p>
        <button class="esign-button" id="start-signing">Start Signing</button>
      </div>
    `;

    // Add click listener for signing button
    this.shadowRoot
      .getElementById("start-signing")
      .addEventListener("click", () => this.startSigning(apiKey, documentId));
  }

  async startSigning(apiKey, documentId) {
    try {
      let result;

      if (this.devMode) {
        // Mock API response in dev mode
        console.log("Dev mode: Mocking signing API call");
        result = await this.mockSigningProcess();
      } else {
        // Real API call
        const response = await fetch("https://your-api.com/sign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ documentId }),
        });

        if (!response.ok) {
          throw new Error("Failed to initiate signing");
        }

        result = await response.json();
      }

      // Handle signing result
      alert(`Signing completed: ${result.status}`);
    } catch (error) {
      console.error("Error during signing process:", error);
      alert("An error occurred: " + error.message);
    }
  }

  // Add mock signing process
  async mockSigningProcess() {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      status: "SUCCESS",
      documentId: this.getAttribute("document-id"),
      timestamp: new Date().toISOString(),
      mockData: true,
    };
  }
}

// Define the custom element
customElements.define("esign-component", ESIGNComponent);
