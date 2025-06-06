// esign-sdk.js - Web Component for electronic document signing
// This component handles document signing workflows with template-based document generation
// and field population capabilities.

class ESIGNComponent extends HTMLElement {
  constructor() {
    super();
    // Create a shadow DOM for style encapsulation
    this.attachShadow({ mode: "open" });
    // Add PDF.js library
    this.loadPDFJS();
    this.currentZoom = 1;
    this.zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];
    this.signatureBlocks = new Set(); // Track all signature blocks
    this.completedSignatures = new Set(); // Track completed signatures

    // Initialize signature navigation properties
    this.currentSignatureIndex = 0;
    this.orderedSignatureBlocks = [];
  }

  // Add method to load PDF.js
  async loadPDFJS() {
    if (window.pdfjsLib) return; // Already loaded

    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    document.head.appendChild(script);

    // Wait for script to load
    await new Promise((resolve) => (script.onload = resolve));

    // Configure worker
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    // Load html2canvas
    if (!window.html2canvas) {
      const html2canvasScript = document.createElement("script");
      html2canvasScript.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      html2canvasScript.async = true;
      document.head.appendChild(html2canvasScript);

      // Wait for html2canvas to load
      await new Promise((resolve) => (html2canvasScript.onload = resolve));
    }
  }

  connectedCallback() {
    const sessionToken = this.getAttribute("session-token");
    this.devMode = this.hasAttribute("dev-mode");
    // Get service URL with a default fallback
    this.serviceUrl =
      this.getAttribute("service-url") || "https://api.esign.com/v1";

    // Validate required session token
    if (!sessionToken) {
      console.error("ESIGNComponent: session-token is required");
      this.renderError("Missing session token");
      return;
    }

    // Extract all session information from the JWT
    const sessionDetails = this.decodeSessionToken(sessionToken);
    this.sessionDetails = sessionDetails;

    // Skip validation in dev mode
    if (!this.devMode && !this.validateSessionDetails(sessionDetails)) {
      this.renderError("Invalid session token");
      return;
    }

    // In dev mode, provide default values if session details are missing
    if (this.devMode) {
      sessionDetails.documentId = sessionDetails.documentId || "DEV-DOC-123";
      sessionDetails.templateId =
        sessionDetails.templateId || "DEV-TEMPLATE-123";
      sessionDetails.signer = sessionDetails.signer || {
        id: "DEV-USER-123",
        email: "dev@example.com",
        fullName: "Dev User",
      };
      sessionDetails.documentFields = sessionDetails.documentFields || {};
    }

    // Store session data
    this.templateId = sessionDetails.templateId;
    this.signerFields = sessionDetails.signer;
    this.documentFields = sessionDetails.documentFields;
    this.documentId = sessionDetails.documentId;

    // Initialize component with loading state
    this.renderInitialUI();

    // Initialize signature management and load PDF asynchronously
    this.initializeComponentAsync();
  }

  /**
   * Renders the initial UI with loading state
   */
  renderInitialUI() {
    // Render the component's UI
    this.shadowRoot.innerHTML = `
      <style>
        /* Container styles */
        .esign-container {
          font-family: Arial, sans-serif;
          border: 1px solid #ccc;
          padding: 20px;
          max-width: 500px;
          margin: auto;
          text-align: center;
          position: relative;
          padding-bottom: 60px;
        }
        /* Primary action button */
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
        .esign-button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }
        /* Development mode indicator */
        .dev-mode-badge {
          background-color: #ffc107;
          color: #000;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 10px;
          display: ${this.devMode ? "inline-block" : "none"};
        }
        /* Error message styling */
        .error-message {
          color: #dc3545;
          margin: 10px 0;
        }
        /* Field preview section styling */
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
        .pdf-container {
          width: 100%;
          height: 250px;
          margin: 20px 0;
          border: 1px solid #ccc;
          overflow: auto;
          background: #f5f5f5;
          cursor: grab;
          position: relative;
        }
        
        .pdf-container.panning {
          cursor: grabbing;
          user-select: none;
        }

        #pages-container {
          position: relative;
          min-width: fit-content;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .pdf-page {
          background: white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          margin: 0 auto;
          max-width: none;
        }
        
        .loading {
          text-align: center;
          padding: 20px;
          font-style: italic;
          color: #666;
        }

        .pdf-controls {
          background: #fff;
          padding: 10px;
          border-bottom: 1px solid #ccc;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .pdf-controls button {
          padding: 5px 10px;
          background: #f8f9fa;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
        }

        .pdf-controls button:hover {
          background: #e9ecef;
        }

        .pdf-controls button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pdf-page-info {
          font-size: 14px;
          color: #666;
        }

        .pdf-zoom-info {
          font-size: 14px;
          color: #666;
          min-width: 60px;
          text-align: center;
        }

        .pdf-page {
          position: relative;
        }

        .page-number {
          position: absolute;
          bottom: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }

        .signature-block {
          position: absolute;
          border: 2px dashed #007bff;
          background: rgba(0, 123, 255, 0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #007bff;
          font-weight: bold;
          text-align: center;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }

        .signature-block:hover {
          background: rgba(0, 123, 255, 0.2);
          border-color: #0056b3;
        }

        .signature-block.completed {
          border-color: #28a745;
          background: rgba(40, 167, 69, 0.1);
          color: #28a745;
        }

        .signature-block.required {
          border-color: #dc3545;
          background: rgba(220, 53, 69, 0.1);
          color: #dc3545;
        }

        .signature-block.initial {
          border-style: dotted;
          font-size: 10px;
        }

        .signature-block.highlighted {
          animation: pulse 1s ease-in-out;
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }

        .signature-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .signature-modal-content {
          background: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
        }

        .signature-canvas {
          border: 1px solid #ccc;
          width: 100%;
          max-width: 400px;
          height: 150px;
          cursor: crosshair;
        }

        .signature-modal-buttons {
          display: flex;
          gap: 10px;
          margin-top: 15px;
          justify-content: flex-end;
        }

        .modal-button {
          padding: 8px 16px;
          border: 1px solid #ccc;
          border-radius: 4px;
          cursor: pointer;
          background: white;
        }

        .modal-button.primary {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .modal-button:hover {
          opacity: 0.8;
        }

        .signature-progress {
          margin: 10px 0;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 4px;
          font-size: 14px;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e9ecef;
          border-radius: 4px;
          overflow: hidden;
          margin: 5px 0;
        }

        .progress-fill {
          height: 100%;
          background: #007bff;
          transition: width 0.3s ease;
        }
      </style>

      <div class="esign-container">
        <div class="dev-mode-badge">Dev Mode</div>
        <h2>Document Signing</h2>
        
        <!-- Field Preview Section -->
        ${this.renderFieldPreview()}
        
        <!-- Signature Progress -->
        <div class="signature-progress" id="signature-progress" style="display: none;">
          <div>Signature Progress: <span id="progress-text">0/0</span></div>
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
          </div>
        </div>
        
        <!-- PDF Container -->
        <div id="pdf-viewer-container" class="pdf-container">
          <div class="loading">Loading template configuration...</div>
        </div>
        
        <!-- Action Buttons -->
        <div style="margin-top: 20px;">
          <button id="start-signing" class="esign-button" style="display: none;" disabled>
            Complete Signing
          </button>
          <div id="remaining-signatures" style="display: none; font-size: 12px; color: #666; margin-top: 5px; text-align: center;">
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initializes the component asynchronously after UI is rendered
   */
  async initializeComponentAsync() {
    try {
      // Initialize signature management first
      await this.initializeSignatureManagement();

      // Add event listeners
      const signButton = this.shadowRoot.querySelector("#start-signing");
      if (signButton) {
        signButton.addEventListener("click", () => {
          // Disable button immediately to prevent multiple submissions
          signButton.disabled = true;
          signButton.textContent = "Processing...";

          this.startSigning(this.getAttribute("session-token"));
        });
      }

      // Load PDF preview after signature management is initialized
      await this.loadPDFPreview();
    } catch (error) {
      console.error("Error initializing component:", error);
      this.renderError(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * Initializes signature management system with template configuration
   */
  async initializeSignatureManagement() {
    try {
      // Fetch template configuration
      const templateConfig = await this.fetchTemplateConfig(this.templateId);
      this.templateConfig = templateConfig;

      // Parse signature blocks from template config
      this.signatureBlocks = this.parseSignatureBlocks(templateConfig);

      // Backward compatibility: use session token signature blocks if no template config
      if (
        this.signatureBlocks.length === 0 &&
        this.sessionDetails.signatureBlocks
      ) {
        this.signatureBlocks = this.sessionDetails.signatureBlocks.map(
          (block, index) => ({
            id: `session_signature_${index}`,
            page: block.page,
            position: block.position,
            dimensions: { width: 200, height: 50 },
            type: "signature",
            required: true,
            completed: false,
          })
        );
      }

      // Initialize signature type management
      this.capturedSignaturesByType = new Map(); // Store captured signatures by type
      this.signatureTypeStatus = new Map(); // Track if we've shown modal for each type

      // Initialize tracking for each signature type found in blocks
      const signatureTypes = [
        ...new Set(this.signatureBlocks.map((block) => block.type)),
      ];
      signatureTypes.forEach((type) => {
        this.signatureTypeStatus.set(type, {
          modalShown: false,
          captured: false,
        });
      });

      console.log("Signature management initialized:", {
        templateConfig: this.templateConfig,
        signatureBlocks: this.signatureBlocks,
        totalSignatures: this.signatureBlocks.length,
        signatureTypes: signatureTypes,
        typeStatus: this.signatureTypeStatus,
      });
    } catch (error) {
      console.error("Error initializing signature management:", error);
      // Fall back to default signature block
      this.signatureBlocks = [
        {
          id: "fallback_signature",
          page: 1,
          position: { x: 25, y: 90 },
          dimensions: { width: 200, height: 50 },
          type: "signature",
          required: true,
          completed: false,
        },
      ];

      // Initialize fallback type tracking
      this.capturedSignaturesByType = new Map();
      this.signatureTypeStatus = new Map();
      this.signatureTypeStatus.set("signature", {
        modalShown: false,
        captured: false,
      });
    }
  }

  /**
   * Validates that the session token contains all required information
   * @param {Object} details Decoded session details
   * @returns {boolean} Whether the session is valid
   */
  validateSessionDetails(details) {
    return !!(
      details &&
      details.documentId &&
      details.templateId &&
      details.signer?.id &&
      details.signer?.email &&
      details.signer?.fullName
    );
  }

  /**
   * Collects all attributes prefixed with 'doc_' and converts them to camelCase field names
   * Example: doc_legal_name -> legalName
   * @returns {Object} Collection of document fields
   */
  getDocumentFields() {
    const fields = {};
    const documentAttributes = Array.from(this.attributes)
      .filter((attr) => attr.name.startsWith("doc_"))
      .forEach((attr) => {
        // Convert doc_legal_name to legalName for API compatibility
        const fieldName = attr.name
          .replace("doc_", "")
          .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        fields[fieldName] = attr.value;
      });
    return fields;
  }

  /**
   * Renders a preview of all populated fields in development mode
   * Groups fields by type: template, signer info, and document fields
   * @returns {string} HTML string for field preview
   */
  renderFieldPreview() {
    if (!this.devMode) return "";

    const sections = [];

    // Show template information if present
    if (this.templateId) {
      sections.push(`
        <div class="field-section">
          <h3>Template</h3>
          <div class="field-row">
            <span class="field-label">Template ID:</span> 
            ${this.templateId}
          </div>
        </div>
      `);
    }

    // Show signer information if any fields are populated
    const populatedSignerFields = Object.entries(this.signerFields)
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

    if (populatedSignerFields) {
      sections.push(`
        <div class="field-section">
          <h3>Signer Information</h3>
          ${populatedSignerFields}
        </div>
      `);
    }

    // Show document fields if any are present
    const populatedDocFields = Object.entries(this.documentFields)
      .map(
        ([key, value]) => `
        <div class="field-row">
          <span class="field-label">${this.formatFieldName(key)}:</span> 
          ${value}
        </div>
      `
      )
      .join("");

    if (populatedDocFields) {
      sections.push(`
        <div class="field-section">
          <h3>Document Fields</h3>
          ${populatedDocFields}
        </div>
      `);
    }

    return sections.length
      ? `<div class="field-preview">${sections.join("")}</div>`
      : "";
  }

  /**
   * Formats camelCase field names into readable labels
   * Example: fullName -> Full Name
   * @param {string} key The field name to format
   * @returns {string} Formatted field name
   */
  formatFieldName(key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/([0-9])/g, " $1");
  }

  /**
   * Decodes the JWT session token to extract session details
   * @param {string} token JWT token to decode
   * @returns {Object} Decoded token payload
   */
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

  /**
   * Fetches template configuration from the API to get signature placement and requirements
   * @param {string} templateId Template ID to fetch configuration for
   * @returns {Promise<Object>} Template configuration with signature blocks
   */
  async fetchTemplateConfig(templateId) {
    try {
      if (this.devMode) {
        console.log("Dev mode: Mocking template config API call", {
          templateId,
        });
        return await this.mockTemplateConfig(templateId);
      }

      const sessionToken = this.getAttribute("session-token");
      const response = await fetch(
        `${this.serviceUrl}/templates/${templateId}/config`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch template config: ${response.status}`);
      }

      const result = await response.json();
      console.log("Template configuration loaded:", result);
      return result.data;
    } catch (error) {
      console.error("Error fetching template config:", error);
      // Fall back to default single signature for backward compatibility
      return this.getDefaultTemplateConfig();
    }
  }

  /**
   * Provides mock template configuration for development mode
   * @param {string} templateId Template ID (for logging)
   * @returns {Promise<Object>} Mock template configuration
   */
  async mockTemplateConfig(templateId) {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      templateId: templateId,
      templateName: "Development Template",
      fields: [
        {
          pdfFieldId: "Legal Name",
          dataField: "documentFields.legalName",
        },
      ],
      signatures: {
        primary_signature: {
          defaultPage: 1,
          defaultX: 25,
          defaultY: 80,
          defaultWidth: 200,
          defaultHeight: 50,
          type: "signature",
          required: true,
        },
        initials_page1: {
          defaultPage: 1,
          defaultX: 70,
          defaultY: 80,
          defaultWidth: 100,
          defaultHeight: 30,
          type: "initial",
          required: false,
        },
      },
    };
  }

  /**
   * Provides default template configuration for backward compatibility
   * @returns {Object} Default single signature configuration
   */
  getDefaultTemplateConfig() {
    return {
      templateId: this.templateId || "default",
      templateName: "Default Template",
      fields: [],
      signatures: {
        default_signature: {
          defaultPage: 1,
          defaultX: 25,
          defaultY: 90,
          defaultWidth: 200,
          defaultHeight: 50,
          type: "signature",
          required: true,
        },
      },
    };
  }

  /**
   * Converts template signature configuration to internal signature blocks format
   * @param {Object} templateConfig Template configuration from API
   * @returns {Array} Array of signature block objects
   */
  parseSignatureBlocks(templateConfig) {
    const signatureBlocks = [];

    if (templateConfig.signatures) {
      Object.entries(templateConfig.signatures).forEach(([id, config]) => {
        signatureBlocks.push({
          id: id,
          page: config.defaultPage,
          position: {
            x: config.defaultX,
            y: config.defaultY,
          },
          dimensions: {
            width: config.defaultWidth,
            height: config.defaultHeight,
          },
          type: config.type,
          required: config.required,
          completed: false,
        });
      });
    }

    return signatureBlocks;
  }

  /**
   * Renders an error message in the component
   * @param {string} message Error message to display
   */
  renderError(message) {
    this.shadowRoot.innerHTML = `
      <div class="esign-container">
        <div class="error-message">${message}</div>
      </div>
    `;
  }

  /**
   * Initiates the signing process
   * In dev mode: simulates the API call
   * In production: makes actual API request with session token
   * @param {string} sessionToken JWT session token
   */
  async startSigning(sessionToken) {
    try {
      let result;

      // Collect completed signatures from the signatureBlocks array
      const completedSignatures = this.signatureBlocks
        ? this.signatureBlocks.filter((block) => block.completed)
        : [];

      console.log(
        "Starting signing process with signatures:",
        completedSignatures
      );

      // Prepare signatures array for the API
      const signatures = completedSignatures.map((block) => ({
        signatureImage: `data:image/png;base64,${this.generateMockSignatureImage(
          block.signatureText
        )}`,
        position: {
          pageNumber: block.page,
          x: block.position.x,
          y: block.position.y,
          width: block.dimensions.width,
          height: block.dimensions.height,
        },
        type: block.type,
        id: block.id,
      }));

      // Prepare signing request payload with multiple signatures support
      const signingData = {
        templateId: this.templateId,
        documentId: this.documentId,
        signer: this.signerFields,
        documentFields: this.documentFields,
        signatureData: {
          signatures: signatures,
        },
      };

      if (this.devMode) {
        console.log("Dev mode: Mocking signing API call", {
          serviceUrl: this.serviceUrl,
          sessionToken,
          signingData,
          totalSignatures: signatures.length,
        });
        result = await this.mockSigningProcess(sessionToken);
      } else {
        const jwt = this.getAttribute("session-token");
        const businessId = JSON.parse(atob(jwt.split(".")[1])).business_id;

        const response = await fetch(
          `${this.serviceUrl}/sessions/business/${businessId}/sign`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify(signingData),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to initiate signing");
        }

        result = await response.json();
      }

      // Update button to show success state
      const signButton = this.shadowRoot.querySelector("#start-signing");
      if (signButton) {
        signButton.textContent = "Signing Successful ✓";
        signButton.style.backgroundColor = "#28a745"; // Green color for success
      }

      // Hide remaining signatures indicator when signing is complete
      const remainingSignaturesDiv = this.shadowRoot.querySelector(
        "#remaining-signatures"
      );
      if (remainingSignaturesDiv) {
        remainingSignaturesDiv.style.display = "none";
      }

      // Dispatch custom event with signing result
      const event = new CustomEvent("signing-complete", {
        bubbles: true,
        composed: true,
        detail: result,
      });
      this.dispatchEvent(event);
    } catch (error) {
      console.error("Error during signing process:", error);

      // Re-enable the button on error so user can retry
      const signButton = this.shadowRoot.querySelector("#start-signing");
      if (signButton) {
        signButton.disabled = false;
        signButton.textContent = "Complete Signing";
      }

      const event = new CustomEvent("signing-error", {
        bubbles: true,
        composed: true,
        detail: { error: error.message },
      });
      this.dispatchEvent(event);
    }
  }

  /**
   * Generates a mock base64 signature image for development mode
   * @param {string} signatureText The text that was signed
   * @returns {string} Base64 encoded signature image
   */
  generateMockSignatureImage(signatureText) {
    // Create a simple canvas with signature text
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");

    // Clear canvas
    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw signature text
    ctx.fillStyle = "#000";
    ctx.font = "18px cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      signatureText || "Signature",
      canvas.width / 2,
      canvas.height / 2
    );

    // Return base64 without the data URL prefix
    return canvas.toDataURL("image/png").split(",")[1];
  }

  /**
   * Simulates the signing process for development testing
   * @param {string} sessionToken JWT session token
   * @returns {Object} Mock API response
   */
  async mockSigningProcess(sessionToken) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      status: "SUCCESS",
      documentId: this.decodeSessionToken(sessionToken).documentId,
      timestamp: new Date().toISOString(),
      mockData: true,
      templateId: this.templateId,
      signer: this.signerFields,
      documentFields: this.documentFields,
    };
  }

  // Add method to load and render PDF
  async loadPDFPreview() {
    try {
      // In dev mode, use a sample PDF with CORS handling
      // const pdfUrl = this.devMode
      //   ? "https://raw.githubusercontent.com/mozilla/pdf.js/master/web/compressed.tracemonkey-pldi-09.pdf" // CORS-friendly sample PDF
      //   : `${this.serviceUrl}/documents/${this.documentId}/preview`;
      const pdfUrl = this.devMode
        ? "https://raw.githubusercontent.com/mozilla/pdf.js/master/web/compressed.tracemonkey-pldi-09.pdf" // CORS-friendly sample PDF
        : "https://worthai-dev-assets.s3.us-east-1.amazonaws.com/8821.pdf";

      // Show loading state
      const container = this.shadowRoot.querySelector("#pdf-viewer-container");
      container.innerHTML = `
        <div class="loading">
          Loading PDF preview...
        </div>
      `;

      // Wait for PDF.js to be loaded
      while (!window.pdfjsLib) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Configure PDF.js for potential CORS issues
      // Configure URL and options based on dev mode
      let url;
      let options = {
        cMapUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
        cMapPacked: true,
      };

      if (this.devMode) {
        url = pdfUrl;
        options.withCredentials = false;
      } else {
        const jwt = this.getAttribute("session-token");
        const businessId = JSON.parse(atob(jwt.split(".")[1])).business_id;
        url = `${this.serviceUrl}/sessions/business/${businessId}/template`;
        options.withCredentials = true;
        // Only add headers in production mode
        options.httpHeaders = {
          Authorization: `Bearer ${this.getAttribute("session-token")}`,
          "Content-Type": "application/json",
        };
      }

      const loadingTask = window.pdfjsLib.getDocument({
        url,
        ...options,
      });

      // Add loading progress
      loadingTask.onProgress = (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        container.innerHTML = `
          <div class="loading">
            Loading PDF preview... ${Math.round(percent)}%
          </div>
        `;
      };

      const pdf = await loadingTask.promise;

      // Clear the container and add controls
      container.innerHTML = `
        <div class="pdf-controls">
          <button id="prev-signature" disabled>← Previous Signature</button>
          <span class="pdf-page-info">Signature <span id="current-signature">1</span> of <span id="total-signatures">${
            this.signatureBlocks ? this.signatureBlocks.length : 0
          }</span></span>
          <button id="next-signature" ${
            !this.signatureBlocks || this.signatureBlocks.length <= 1
              ? "disabled"
              : ""
          }>Next Signature →</button>
          <button id="zoom-out">−</button>
          <span class="pdf-zoom-info">100%</span>
          <button id="zoom-in">+</button>
        </div>
        <div id="pages-container"></div>
      `;

      // Get the containers and controls
      const pagesContainer = container.querySelector("#pages-container");
      const pdfContainer = this.shadowRoot.querySelector(".pdf-container");
      const prevSignatureButton = container.querySelector("#prev-signature");
      const nextSignatureButton = container.querySelector("#next-signature");
      const zoomOutButton = container.querySelector("#zoom-out");
      const zoomInButton = container.querySelector("#zoom-in");
      const currentSignatureSpan =
        container.querySelector("#current-signature");
      const totalSignaturesSpan = container.querySelector("#total-signatures");
      const zoomInfo = container.querySelector(".pdf-zoom-info");

      // Initialize signature navigation
      this.currentSignatureIndex = 0;
      this.orderedSignatureBlocks = [];

      // Function to create ordered list of signature blocks (by page, then by position)
      const createOrderedSignatureList = () => {
        if (!this.signatureBlocks || !Array.isArray(this.signatureBlocks)) {
          return [];
        }

        return [...this.signatureBlocks].sort((a, b) => {
          // First sort by page
          if (a.page !== b.page) {
            return a.page - b.page;
          }
          // Then sort by Y position (top to bottom)
          if (a.position.y !== b.position.y) {
            return a.position.y - b.position.y;
          }
          // Finally sort by X position (left to right)
          return a.position.x - b.position.x;
        });
      };

      // Function to navigate to a specific signature block
      const navigateToSignature = (index) => {
        if (
          !this.orderedSignatureBlocks ||
          this.orderedSignatureBlocks.length === 0
        ) {
          return;
        }

        // Ensure index is within bounds
        index = Math.max(
          0,
          Math.min(index, this.orderedSignatureBlocks.length - 1)
        );
        this.currentSignatureIndex = index;

        const signatureBlock = this.orderedSignatureBlocks[index];

        // Find the corresponding DOM element
        const signatureElement = this.shadowRoot.querySelector(
          `[data-block-id="${signatureBlock.id}"]`
        );

        if (signatureElement) {
          // Auto-scroll to the signature block
          this.scrollToSignatureBlock(signatureElement);

          // Highlight the signature block
          this.highlightSignatureBlock(signatureElement);
        }

        // Update UI
        currentSignatureSpan.textContent = index + 1;
        prevSignatureButton.disabled = false; // Always enabled for looping
        nextSignatureButton.disabled = false; // Always enabled for looping

        console.log(
          `Navigated to signature ${index + 1} of ${
            this.orderedSignatureBlocks.length
          }`
        );
      };

      // Update signature navigation when blocks are rendered
      const updateSignatureNavigation = () => {
        this.orderedSignatureBlocks = createOrderedSignatureList();
        totalSignaturesSpan.textContent = this.orderedSignatureBlocks.length;

        if (this.orderedSignatureBlocks.length > 0) {
          // Start at the first signature
          this.currentSignatureIndex = 0;
          currentSignatureSpan.textContent = "1";
          prevSignatureButton.disabled = false;
          nextSignatureButton.disabled =
            this.orderedSignatureBlocks.length <= 1;
        } else {
          currentSignatureSpan.textContent = "0";
          prevSignatureButton.disabled = true;
          nextSignatureButton.disabled = true;
        }
      };

      // Navigation button handlers with looping
      prevSignatureButton.addEventListener("click", () => {
        console.log("Previous signature button clicked");
        this.navigateToPreviousSignature();
      });

      nextSignatureButton.addEventListener("click", () => {
        console.log("Next signature button clicked");
        this.navigateToNextSignature();
      });

      // Add keyboard navigation for signatures
      pdfContainer.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          this.navigateToNextSignature();
          e.preventDefault();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          this.navigateToPreviousSignature();
          e.preventDefault();
        }
      });

      // Zoom handlers
      let isPanning = false;
      let startX;
      let startY;
      let scrollLeft;
      let scrollTop;

      const startPanning = (e) => {
        isPanning = true;
        pdfContainer.classList.add("panning");
        startX = e.pageX - pdfContainer.offsetLeft;
        startY = e.pageY - pdfContainer.offsetTop;
        scrollLeft = pdfContainer.scrollLeft;
        scrollTop = pdfContainer.scrollTop;
      };

      const stopPanning = () => {
        isPanning = false;
        pdfContainer.classList.remove("panning");
      };

      const pan = (e) => {
        if (!isPanning) return;

        e.preventDefault();
        const x = e.pageX - pdfContainer.offsetLeft;
        const y = e.pageY - pdfContainer.offsetTop;
        const moveX = x - startX;
        const moveY = y - startY;

        pdfContainer.scrollLeft = scrollLeft - moveX;
        pdfContainer.scrollTop = scrollTop - moveY;
      };

      // Only enable panning when zoomed in
      const updatePanningState = () => {
        if (this.currentZoom > 1) {
          pdfContainer.addEventListener("mousedown", startPanning);
          document.addEventListener("mousemove", pan);
          document.addEventListener("mouseup", stopPanning);
          pdfContainer.style.cursor = "grab";
        } else {
          pdfContainer.removeEventListener("mousedown", startPanning);
          document.removeEventListener("mousemove", pan);
          document.removeEventListener("mouseup", stopPanning);
          pdfContainer.style.cursor = "default";
        }
      };

      // Update the zoom handler to include panning state
      const updateZoom = (newZoom) => {
        // Get current scroll position and visible page before zoom
        const currentScrollTop = pdfContainer.scrollTop;
        const currentScrollLeft = pdfContainer.scrollLeft;
        const containerHeight = pdfContainer.clientHeight;

        // Calculate relative position (as percentage) before zoom
        const scrollRatio = {
          top: currentScrollTop / pdfContainer.scrollHeight,
          left: currentScrollLeft / pdfContainer.scrollWidth,
        };

        // Show loading overlay
        container.insertAdjacentHTML(
          "afterbegin",
          `
          <div class="loading-overlay">
            <div class="loading">Updating zoom...</div>
          </div>
        `
        );

        // Update zoom
        this.currentZoom = newZoom;
        zoomInfo.textContent = `${Math.round(newZoom * 100)}%`;
        updatePanningState();

        // Render with new zoom
        this.renderAllPages(pdf, pagesContainer).then(() => {
          // Remove loading overlay
          container.querySelector(".loading-overlay")?.remove();

          // Restore scroll position after render
          requestAnimationFrame(() => {
            pdfContainer.scrollTop =
              scrollRatio.top * pdfContainer.scrollHeight;
            pdfContainer.scrollLeft =
              scrollRatio.left * pdfContainer.scrollWidth;
          });
        });
      };

      // Add zoom button handlers
      zoomOutButton.addEventListener("click", () => {
        const currentIndex = this.zoomLevels.indexOf(this.currentZoom);
        if (currentIndex > 0) {
          updateZoom(this.zoomLevels[currentIndex - 1]);
        }
      });

      zoomInButton.addEventListener("click", () => {
        const currentIndex = this.zoomLevels.indexOf(this.currentZoom);
        if (currentIndex < this.zoomLevels.length - 1) {
          updateZoom(this.zoomLevels[currentIndex + 1]);
        }
      });

      // Initial panning state
      updatePanningState();

      // Clean up event listeners when component is removed
      this.cleanup = () => {
        pdfContainer.removeEventListener("mousedown", startPanning);
        document.removeEventListener("mousemove", pan);
        document.removeEventListener("mouseup", stopPanning);
      };

      // Initial render
      await this.renderAllPages(pdf, pagesContainer);

      // Store the navigation update function for later use
      this.updateSignatureNavigation = updateSignatureNavigation;
    } catch (error) {
      console.error("Error loading PDF preview:", error);
      const container = this.shadowRoot.querySelector("#pdf-viewer-container");

      // Show more user-friendly error message
      container.innerHTML = `
        <div class="error-message">
          <p>Unable to load PDF preview.</p>
          ${
            this.devMode
              ? `
            <p>Development mode: Using a sample PDF failed. This might be due to:</p>
            <ul>
              <li>CORS restrictions</li>
              <li>Network connectivity issues</li>
              <li>PDF server unavailability</li>
            </ul>
            <p>Technical details: ${error.message}</p>
          `
              : `
            <p>Please try again later or contact support if the issue persists.</p>
          `
          }
        </div>
      `;
    }
  }

  // Add new method for rendering pages
  async renderAllPages(pdf, container) {
    container.innerHTML = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      // Add loading indicator for each page
      const pageContainer = document.createElement("div");
      pageContainer.className = "pdf-page";
      pageContainer.dataset.page = pageNum;
      pageContainer.innerHTML = `
        <div class="loading">
          Loading page ${pageNum}...
        </div>
        <div class="page-number">Page ${pageNum}</div>
      `;
      container.appendChild(pageContainer);

      // Get the page
      const page = await pdf.getPage(pageNum);

      // Calculate scale to fit width
      const pdfContainer = this.shadowRoot.querySelector(".pdf-container");
      const containerStyles = window.getComputedStyle(pdfContainer);
      const containerPadding =
        parseInt(containerStyles.paddingLeft) +
        parseInt(containerStyles.paddingRight);

      // Account for container padding and pages-container padding
      const availableWidth = pdfContainer.clientWidth - containerPadding - 40;

      const viewport = page.getViewport({ scale: 1 });
      const scale = (availableWidth / viewport.width) * this.currentZoom;
      const scaledViewport = page.getViewport({ scale });

      // Create canvas for this page
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      // Replace loading indicator with canvas (keep page number)
      const pageNumber = pageContainer.querySelector(".page-number");
      pageContainer.innerHTML = "";
      pageContainer.appendChild(canvas);
      pageContainer.appendChild(pageNumber);

      // Render the page
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport: scaledViewport,
      }).promise;

      // Add signature blocks for this page from the signatureBlocks array
      if (this.signatureBlocks && Array.isArray(this.signatureBlocks)) {
        const blocksForThisPage = this.signatureBlocks.filter(
          (block) => block.page === pageNum
        );

        blocksForThisPage.forEach((blockConfig) => {
          const signatureBlock = document.createElement("div");

          // Set CSS classes based on block configuration
          const classes = ["signature-block"];
          if (blockConfig.required) classes.push("required");
          if (blockConfig.type === "initial") classes.push("initial");
          if (blockConfig.completed) classes.push("completed");

          signatureBlock.className = classes.join(" ");

          // Set content based on type and completion status
          if (blockConfig.completed) {
            signatureBlock.textContent =
              blockConfig.signatureText || "✓ Signed";
            signatureBlock.style.cursor = "default";
          } else {
            const label =
              blockConfig.type === "initial"
                ? "Click to initial"
                : "Click to sign";
            signatureBlock.textContent = label;
            signatureBlock.style.cursor = "pointer";
          }

          // Position and size the block
          signatureBlock.style.left = `${blockConfig.position.x}%`;
          signatureBlock.style.top = `${blockConfig.position.y}%`;
          signatureBlock.style.width = `${blockConfig.dimensions.width}px`;
          signatureBlock.style.height = `${blockConfig.dimensions.height}px`;
          signatureBlock.style.textAlign = "center";

          // Store reference to the configuration
          signatureBlock.dataset.blockId = blockConfig.id;
          signatureBlock.dataset.pageNumber = pageNum;

          pageContainer.appendChild(signatureBlock);

          // Add click handler only if not completed
          if (!blockConfig.completed) {
            signatureBlock.addEventListener("click", () => {
              // Auto-scroll to the clicked signature block
              this.scrollToSignatureBlock(signatureBlock);

              // Highlight the clicked block
              this.highlightSignatureBlock(signatureBlock);

              // Check if we've already captured this signature type
              const typeStatus = this.signatureTypeStatus.get(blockConfig.type);
              const capturedSignature = this.capturedSignaturesByType.get(
                blockConfig.type
              );

              if (typeStatus && typeStatus.captured && capturedSignature) {
                // Auto-apply existing signature for this type
                this.autoApplySignature(
                  blockConfig,
                  signatureBlock,
                  capturedSignature
                );
              } else {
                // Show modal for first signature of this type
                this.showSignatureModal(blockConfig, signatureBlock);
              }
            });
          }
        });
      }
    }

    // Update signature status after rendering all pages
    this.updateSignatureStatus();

    // Update signature navigation after all blocks are rendered
    this.updateSignatureNavigation();

    // Auto-scroll to the first signature block after rendering is complete
    if (this.signatureBlocks && this.signatureBlocks.length > 0) {
      // Use a small delay to ensure DOM elements are properly positioned
      setTimeout(() => {
        // Use the new navigation system to go to the first signature
        if (
          this.orderedSignatureBlocks &&
          this.orderedSignatureBlocks.length > 0
        ) {
          const firstSignatureBlock = this.orderedSignatureBlocks[0];
          const firstSignatureElement = this.shadowRoot.querySelector(
            `[data-block-id="${firstSignatureBlock.id}"]`
          );

          if (firstSignatureElement) {
            console.log(
              "Auto-scrolling to first signature block using navigation system"
            );
            this.scrollToSignatureBlock(firstSignatureElement);
            this.highlightSignatureBlock(firstSignatureElement);

            // Update the navigation counter
            this.currentSignatureIndex = 0;
            const currentSignatureSpan =
              this.shadowRoot.querySelector("#current-signature");
            if (currentSignatureSpan) {
              currentSignatureSpan.textContent = "1";
            }
          }
        } else {
          // Fallback to the old method if navigation system isn't ready
          const firstSignatureElement = this.shadowRoot.querySelector(
            ".signature-block:not(.completed)"
          );

          if (firstSignatureElement) {
            console.log(
              "Auto-scrolling to first signature block (fallback method)"
            );
            this.scrollToSignatureBlock(firstSignatureElement);
            this.highlightSignatureBlock(firstSignatureElement);
          }
        }
      }, 300); // Small delay to ensure smooth rendering
    }
  }

  /**
   * Shows the signature modal for capturing user signature/initial
   * @param {Object} blockConfig Configuration object for the signature block
   * @param {HTMLElement} signatureElement DOM element for the signature block
   */
  showSignatureModal(blockConfig, signatureElement) {
    console.log("Signature block clicked:", blockConfig);

    // Mark that we've shown the modal for this type
    const typeStatus = this.signatureTypeStatus.get(blockConfig.type);
    if (typeStatus) {
      typeStatus.modalShown = true;
    }

    // Create modal
    const modal = document.createElement("div");
    modal.className = "signature-modal";

    const modalContent = document.createElement("div");
    modalContent.className = "signature-modal-content";

    const title =
      blockConfig.type === "initial"
        ? "Enter your initials"
        : "Enter your signature";

    // Count how many blocks of this type exist
    const blocksOfSameType = this.signatureBlocks.filter(
      (block) => block.type === blockConfig.type
    );
    const showApplyToAllOption = blocksOfSameType.length > 1;

    modalContent.innerHTML = `
      <h3>${title}</h3>
      <div class="consent-statement" style="margin-bottom: 15px; font-size: 12px; line-height: 1.4; max-width: 400px; color: #555;">
        By checking this box and clicking "${title
          .replace("Enter your ", "")
          .replace(
            "e",
            "E"
          )}", you (i) consent to conduct business electronically and to receive all related disclosures, agreements, and records in electronic form, (ii) acknowledge that you have access to retain or print electronic records, and (iii) agree that your electronic signature is legally binding and that you intend to electronically sign this document. You may withdraw your consent or request a paper copy by contacting us at support@joinworth.com or visiting www.joinworth.com.
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="consent-checkbox" style="margin-right: 8px;" required>
          <span style="font-size: 14px;">I agree to the terms above</span>
        </label>
      </div>
      <input type="text" placeholder="Type your ${
        blockConfig.type === "initial" ? "initials" : "name"
      }" style="margin: 10px 0; padding: 5px; width: 100%;">
      ${
        showApplyToAllOption
          ? `
      <div style="margin: 10px 0;">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="apply-to-all-checkbox" style="margin-right: 8px;">
          <span style="font-size: 14px;">Apply this ${blockConfig.type} to all ${blockConfig.type} blocks (${blocksOfSameType.length} total)</span>
        </label>
      </div>
      `
          : ""
      }
      <div class="signature-modal-buttons">
        <button class="modal-button cancel-button">Cancel</button>
        <button class="modal-button primary" id="sign-button" disabled>${
          blockConfig.type === "initial" ? "Initial" : "Sign"
        }</button>
      </div>
    `;

    modal.appendChild(modalContent);
    this.shadowRoot.appendChild(modal);

    // Get references to form elements
    const input = modalContent.querySelector("input[type='text']");
    const consentCheckbox = modalContent.querySelector("#consent-checkbox");
    const applyToAllCheckbox = modalContent.querySelector(
      "#apply-to-all-checkbox"
    );
    const signButton = modalContent.querySelector("#sign-button");
    const cancelButton = modalContent.querySelector(".cancel-button");

    // Focus input
    input.focus();

    // Handle consent checkbox
    const updateSignButtonState = () => {
      signButton.disabled = !consentCheckbox.checked || !input.value.trim();
    };

    consentCheckbox.addEventListener("change", updateSignButtonState);
    input.addEventListener("input", updateSignButtonState);

    // Handle cancel
    cancelButton.addEventListener("click", () => {
      modal.remove();
    });

    // Handle sign
    const handleSign = () => {
      const signatureText = input.value.trim();
      if (signatureText && consentCheckbox.checked) {
        // Save the captured signature for this type
        const capturedSignature = {
          text: signatureText,
          timestamp: new Date().toISOString(),
          type: blockConfig.type,
        };

        this.capturedSignaturesByType.set(blockConfig.type, capturedSignature);

        // Update type status
        const typeStatus = this.signatureTypeStatus.get(blockConfig.type);
        if (typeStatus) {
          typeStatus.captured = true;
        }

        // Apply to current block
        this.applySignatureToBlock(
          blockConfig,
          signatureElement,
          capturedSignature
        );

        // If apply to all is checked, apply to all blocks of this type
        if (applyToAllCheckbox && applyToAllCheckbox.checked) {
          this.applySignatureToAllBlocksOfType(
            blockConfig.type,
            capturedSignature
          );
        }

        // Close modal
        modal.remove();

        console.log(
          "Signature captured for type:",
          blockConfig.type,
          capturedSignature
        );
      }
    };

    signButton.addEventListener("click", handleSign);
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !signButton.disabled) {
        handleSign();
      }
    });
  }

  /**
   * Applies a signature to a specific block
   * @param {Object} blockConfig Configuration object for the signature block
   * @param {HTMLElement} signatureElement DOM element for the signature block
   * @param {Object} capturedSignature The captured signature data
   */
  applySignatureToBlock(blockConfig, signatureElement, capturedSignature) {
    // Update block configuration
    blockConfig.completed = true;
    blockConfig.signatureText = capturedSignature.text;
    blockConfig.timestamp = capturedSignature.timestamp;

    // Update DOM element
    signatureElement.textContent = capturedSignature.text;
    signatureElement.className =
      signatureElement.className.replace("required", "") + " completed";
    signatureElement.style.cursor = "default";

    // Remove click handler
    const newElement = signatureElement.cloneNode(true);
    signatureElement.parentNode.replaceChild(newElement, signatureElement);

    // Update signature status
    this.updateSignatureStatus();
  }

  /**
   * Applies a signature to all blocks of the specified type
   * @param {string} signatureType The type of signature blocks to update
   * @param {Object} capturedSignature The captured signature data
   */
  applySignatureToAllBlocksOfType(signatureType, capturedSignature) {
    const blocksOfType = this.signatureBlocks.filter(
      (block) => block.type === signatureType && !block.completed
    );

    console.log(
      `Applying ${signatureType} to ${blocksOfType.length} remaining blocks`
    );

    // Find and update DOM elements for all blocks of this type
    const allSignatureElements =
      this.shadowRoot.querySelectorAll(".signature-block");

    blocksOfType.forEach((blockConfig) => {
      // Find the corresponding DOM element
      const signatureElement = Array.from(allSignatureElements).find(
        (element) => element.dataset.blockId === blockConfig.id
      );

      if (signatureElement && !blockConfig.completed) {
        this.applySignatureToBlock(
          blockConfig,
          signatureElement,
          capturedSignature
        );
      }
    });

    // Show notification
    if (blocksOfType.length > 0) {
      this.showAutoApplyNotification(
        signatureType,
        `Applied to ${blocksOfType.length + 1} ${signatureType} blocks`
      );
    }
  }

  /**
   * Auto-applies a previously captured signature to a signature block
   * @param {Object} blockConfig Configuration object for the signature block
   * @param {HTMLElement} signatureElement DOM element for the signature block
   * @param {Object} capturedSignature Previously captured signature data
   */
  autoApplySignature(blockConfig, signatureElement, capturedSignature) {
    console.log(
      `Auto-applying ${blockConfig.type} signature:`,
      capturedSignature
    );

    // Update block configuration
    blockConfig.completed = true;
    blockConfig.signatureText = capturedSignature.text;
    blockConfig.timestamp = new Date().toISOString();
    blockConfig.autoApplied = true;

    // Update DOM element
    signatureElement.textContent = capturedSignature.text;
    signatureElement.className =
      signatureElement.className.replace("required", "") + " completed";
    signatureElement.style.cursor = "default";

    // Remove click handler
    const newElement = signatureElement.cloneNode(true);
    signatureElement.parentNode.replaceChild(newElement, signatureElement);

    // Add visual indicator for auto-applied signature
    newElement.title = `Auto-applied ${blockConfig.type}: ${capturedSignature.text}`;

    // Update signature status
    this.updateSignatureStatus();

    // Show brief notification
    this.showAutoApplyNotification(blockConfig.type, capturedSignature.text);
  }

  /**
   * Shows a brief notification when a signature is auto-applied
   * @param {string} type The signature type (signature/initial)
   * @param {string} text The signature text
   */
  showAutoApplyNotification(type, text) {
    const notification = document.createElement("div");
    notification.className = "auto-apply-notification";
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1001;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
      ">
        ✓ ${type === "initial" ? "Initial" : "Signature"} auto-applied: ${text}
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;

    this.shadowRoot.appendChild(notification);

    // Remove notification after 2 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 2000);
  }

  // Add helper method to check if all required signatures are complete
  areAllSignaturesComplete() {
    // Return false if no signature blocks are defined
    if (!this.signatureBlocks || this.signatureBlocks.length === 0) {
      return false;
    }

    // For arrays (new structure), check completion status
    if (Array.isArray(this.signatureBlocks)) {
      const requiredSignatures = this.signatureBlocks.filter(
        (block) => block.required
      );
      const completedRequired = requiredSignatures.filter(
        (block) => block.completed
      );
      return (
        requiredSignatures.length > 0 &&
        completedRequired.length === requiredSignatures.length
      );
    }

    // For Sets (legacy structure), check DOM elements
    for (const block of this.signatureBlocks) {
      if (
        block.classList &&
        block.classList.contains("required") &&
        !this.completedSignatures.has(block)
      ) {
        return false;
      }
    }

    return this.completedSignatures.size > 0;
  }

  // Add disconnectedCallback to clean up event listeners
  disconnectedCallback() {
    if (this.cleanup) {
      this.cleanup();
    }
  }

  // Add method to update signature status
  updateSignatureStatus() {
    const progressContainer = this.shadowRoot.querySelector(
      "#signature-progress"
    );
    const progressText = this.shadowRoot.querySelector("#progress-text");
    const progressFill = this.shadowRoot.querySelector("#progress-fill");
    const completeButton = this.shadowRoot.querySelector("#start-signing");
    const remainingSignaturesDiv = this.shadowRoot.querySelector(
      "#remaining-signatures"
    );

    // Return early if elements don't exist yet
    if (!progressContainer || !progressText || !progressFill) {
      return;
    }

    // Calculate progress based on signatureBlocks array
    const totalSignatures = this.signatureBlocks
      ? this.signatureBlocks.length
      : 0;
    const completedSignatures = this.signatureBlocks
      ? this.signatureBlocks.filter((block) => block.completed).length
      : 0;
    const remainingSignatures = totalSignatures - completedSignatures;

    // Update progress text and bar
    progressText.textContent = `${completedSignatures}/${totalSignatures}`;
    const progressPercentage =
      totalSignatures > 0 ? (completedSignatures / totalSignatures) * 100 : 0;
    progressFill.style.width = `${progressPercentage}%`;

    // Show/hide progress container based on whether we have signature blocks
    if (totalSignatures > 0) {
      progressContainer.style.display = "block";
    } else {
      progressContainer.style.display = "none";
    }

    // Update complete button visibility and enable/disable state
    if (completeButton) {
      if (totalSignatures > 0) {
        completeButton.style.display = "inline-block";

        // Check if all required signatures are complete
        const allComplete = this.areAllSignaturesComplete();
        completeButton.disabled = !allComplete;

        if (allComplete) {
          completeButton.textContent = "Complete Signing";
          progressContainer.style.background = "#d4edda";
          progressContainer.style.color = "#155724";

          // Keep showing remaining signatures until signing process is complete
          if (remainingSignaturesDiv && remainingSignatures > 0) {
            remainingSignaturesDiv.textContent = `(${remainingSignatures} signature${
              remainingSignatures === 1 ? "" : "s"
            } remaining)`;
            remainingSignaturesDiv.style.display = "block";
          } else if (remainingSignaturesDiv && remainingSignatures === 0) {
            remainingSignaturesDiv.style.display = "none";
          }
        } else {
          completeButton.textContent = `Sign Document (${completedSignatures}/${totalSignatures})`;
          progressContainer.style.background = "#f8f9fa";
          progressContainer.style.color = "inherit";

          // Show remaining signatures indicator
          if (remainingSignaturesDiv && remainingSignatures > 0) {
            remainingSignaturesDiv.textContent = `(${remainingSignatures} signature${
              remainingSignatures === 1 ? "" : "s"
            } remaining)`;
            remainingSignaturesDiv.style.display = "block";
          } else if (remainingSignaturesDiv && remainingSignatures === 0) {
            remainingSignaturesDiv.style.display = "none";
          }
        }
      } else {
        completeButton.style.display = "none";
        if (remainingSignaturesDiv) {
          remainingSignaturesDiv.style.display = "none";
        }
      }
    }
  }

  /**
   * Scrolls smoothly to a signature block element in the PDF container
   * @param {HTMLElement} signatureElement The signature block to scroll to
   */
  scrollToSignatureBlock(signatureElement) {
    const pdfContainer = this.shadowRoot.querySelector(".pdf-container");
    if (!pdfContainer || !signatureElement) return;

    // Get the position of the signature block relative to the PDF container
    const containerRect = pdfContainer.getBoundingClientRect();
    const elementRect = signatureElement.getBoundingClientRect();

    // Calculate the target scroll position
    const targetScrollTop =
      pdfContainer.scrollTop +
      (elementRect.top - containerRect.top) -
      pdfContainer.clientHeight / 2 +
      elementRect.height / 2;
    const targetScrollLeft =
      pdfContainer.scrollLeft +
      (elementRect.left - containerRect.left) -
      pdfContainer.clientWidth / 2 +
      elementRect.width / 2;

    // Smooth scroll animation
    const startScrollTop = pdfContainer.scrollTop;
    const startScrollLeft = pdfContainer.scrollLeft;
    const scrollTopDistance = targetScrollTop - startScrollTop;
    const scrollLeftDistance = targetScrollLeft - startScrollLeft;
    const duration = 500; // 500ms animation
    const startTime = performance.now();

    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeInOutCubic =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      pdfContainer.scrollTop =
        startScrollTop + scrollTopDistance * easeInOutCubic;
      pdfContainer.scrollLeft =
        startScrollLeft + scrollLeftDistance * easeInOutCubic;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }

  /**
   * Highlights a signature block temporarily to draw attention
   * @param {HTMLElement} signatureElement The signature block to highlight
   */
  highlightSignatureBlock(signatureElement) {
    if (!signatureElement) return;

    // Add highlight class
    signatureElement.classList.add("highlighted");

    // Add temporary highlight styles
    const originalBorderColor = signatureElement.style.borderColor;
    const originalBoxShadow = signatureElement.style.boxShadow;

    signatureElement.style.borderColor = "#ffc107";
    signatureElement.style.boxShadow = "0 0 10px rgba(255, 193, 7, 0.5)";

    // Remove highlight after animation
    setTimeout(() => {
      signatureElement.style.borderColor = originalBorderColor;
      signatureElement.style.boxShadow = originalBoxShadow;
      signatureElement.classList.remove("highlighted");
    }, 1000);
  }

  /**
   * Creates an ordered list of signature blocks sorted by page, then position
   * @returns {Array} Ordered array of signature blocks
   */
  createOrderedSignatureList() {
    if (!this.signatureBlocks || !Array.isArray(this.signatureBlocks)) {
      return [];
    }

    return [...this.signatureBlocks].sort((a, b) => {
      // First sort by page
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      // Then sort by Y position (top to bottom)
      if (a.position.y !== b.position.y) {
        return a.position.y - b.position.y;
      }
      // Finally sort by X position (left to right)
      return a.position.x - b.position.x;
    });
  }

  /**
   * Navigates to a specific signature block by index
   * @param {number} index The index of the signature block to navigate to
   */
  navigateToSignature(index) {
    if (
      !this.orderedSignatureBlocks ||
      this.orderedSignatureBlocks.length === 0
    ) {
      console.log("No signature blocks available for navigation");
      return;
    }

    // Ensure index is within bounds
    index = Math.max(
      0,
      Math.min(index, this.orderedSignatureBlocks.length - 1)
    );
    this.currentSignatureIndex = index;

    const signatureBlock = this.orderedSignatureBlocks[index];

    // Find the corresponding DOM element
    const signatureElement = this.shadowRoot.querySelector(
      `[data-block-id="${signatureBlock.id}"]`
    );

    if (signatureElement) {
      // Auto-scroll to the signature block
      this.scrollToSignatureBlock(signatureElement);

      // Highlight the signature block
      this.highlightSignatureBlock(signatureElement);
    } else {
      console.log(
        `Could not find signature element for block ID: ${signatureBlock.id}`
      );
    }

    // Update UI
    const currentSignatureSpan =
      this.shadowRoot.querySelector("#current-signature");
    if (currentSignatureSpan) {
      currentSignatureSpan.textContent = index + 1;
    }

    console.log(
      `Navigated to signature ${index + 1} of ${
        this.orderedSignatureBlocks.length
      }`,
      signatureBlock
    );
  }

  /**
   * Updates the signature navigation system after blocks are rendered
   */
  updateSignatureNavigation() {
    this.orderedSignatureBlocks = this.createOrderedSignatureList();

    const totalSignaturesSpan =
      this.shadowRoot.querySelector("#total-signatures");
    const currentSignatureSpan =
      this.shadowRoot.querySelector("#current-signature");
    const prevSignatureButton =
      this.shadowRoot.querySelector("#prev-signature");
    const nextSignatureButton =
      this.shadowRoot.querySelector("#next-signature");

    if (totalSignaturesSpan) {
      totalSignaturesSpan.textContent = this.orderedSignatureBlocks.length;
    }

    if (this.orderedSignatureBlocks.length > 0) {
      // Start at the first signature
      this.currentSignatureIndex = 0;
      if (currentSignatureSpan) {
        currentSignatureSpan.textContent = "1";
      }
      if (prevSignatureButton) {
        prevSignatureButton.disabled = this.orderedSignatureBlocks.length <= 1;
      }
      if (nextSignatureButton) {
        nextSignatureButton.disabled = this.orderedSignatureBlocks.length <= 1;
      }
    } else {
      if (currentSignatureSpan) {
        currentSignatureSpan.textContent = "0";
      }
      if (prevSignatureButton) {
        prevSignatureButton.disabled = true;
      }
      if (nextSignatureButton) {
        nextSignatureButton.disabled = true;
      }
    }

    console.log("Signature navigation updated:", {
      total: this.orderedSignatureBlocks.length,
      orderedBlocks: this.orderedSignatureBlocks,
    });
  }

  /**
   * Navigates to the previous signature with looping
   */
  navigateToPreviousSignature() {
    if (this.orderedSignatureBlocks.length === 0) return;

    let newIndex = this.currentSignatureIndex - 1;
    // Loop to last signature if at first
    if (newIndex < 0) {
      newIndex = this.orderedSignatureBlocks.length - 1;
    }
    this.navigateToSignature(newIndex);
  }

  /**
   * Navigates to the next signature with looping
   */
  navigateToNextSignature() {
    if (this.orderedSignatureBlocks.length === 0) return;

    let newIndex = this.currentSignatureIndex + 1;
    // Loop to first signature if at last
    if (newIndex >= this.orderedSignatureBlocks.length) {
      newIndex = 0;
    }
    this.navigateToSignature(newIndex);
  }
}

// Register the custom element with the browser
customElements.define("esign-component", ESIGNComponent);
