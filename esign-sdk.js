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
          height: 500px;
          margin: 20px 0;
          border: 1px solid #ccc;
          overflow: auto;  /* Change from overflow-y to overflow */
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
          min-width: 100%;
          /* Add padding to ensure space around the PDF when zoomed */
          padding: 20px;
        }
        
        .pdf-page {
          background: white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          margin: 0 auto;
          max-width: none;  /* Allow page to expand beyond container width when zoomed */
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
      </style>
      <div class="esign-container">
        <div class="dev-mode-badge">Dev Mode</div>
        <p>Ready to sign document ID: ${sessionDetails.documentId}</p>
        <div class="pdf-container">
          <div id="pdf-viewer-container">
            <canvas id="pdf-canvas"></canvas>
          </div>
        </div>
        ${this.renderFieldPreview()}
        <button class="esign-button" id="start-signing">Start Signing</button>
      </div>
    `;

    // Load and render PDF
    this.loadPDFPreview();

    // Attach click handler for the signing button
    this.shadowRoot
      .getElementById("start-signing")
      .addEventListener("click", () => this.startSigning(sessionToken));
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
   * Decodes the JWT token to extract session information
   * Note: This is for display purposes only, actual validation happens server-side
   * @param {string} token JWT session token
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

      if (this.devMode) {
        console.log("Dev mode: Mocking signing API call", {
          serviceUrl: this.serviceUrl,
          sessionToken,
          templateId: this.templateId,
          signer: this.signerFields,
          documentFields: this.documentFields,
        });
        result = await this.mockSigningProcess(sessionToken);
      } else {
        const response = await fetch(`${this.serviceUrl}/sign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            templateId: this.templateId,
            signer: this.signerFields,
            documentFields: this.documentFields,
            documentId: this.decodeSessionToken(sessionToken).documentId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to initiate signing");
        }

        result = await response.json();
      }

      // Dispatch custom event with signing result
      const event = new CustomEvent("signing-complete", {
        bubbles: true,
        composed: true, // Allows event to cross shadow DOM boundary
        detail: result,
      });
      this.dispatchEvent(event);
    } catch (error) {
      console.error("Error during signing process:", error);
      // Dispatch error event
      const event = new CustomEvent("signing-error", {
        bubbles: true,
        composed: true,
        detail: { error: error.message },
      });
      this.dispatchEvent(event);
    }
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
      const pdfUrl = this.devMode
        ? "https://raw.githubusercontent.com/mozilla/pdf.js/master/web/compressed.tracemonkey-pldi-09.pdf" // CORS-friendly sample PDF
        : `${this.serviceUrl}/documents/${this.documentId}/preview`;

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
      const loadingTask = window.pdfjsLib.getDocument({
        url: pdfUrl,
        withCredentials: !this.devMode, // Enable credentials for production URLs
        cMapUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
        cMapPacked: true,
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
          <button id="prev-page" disabled>← Previous</button>
          <span class="pdf-page-info">Page <span id="current-page">1</span> of ${
            pdf.numPages
          }</span>
          <button id="next-page" ${
            pdf.numPages <= 1 ? "disabled" : ""
          }>Next →</button>
          <button id="zoom-out">−</button>
          <span class="pdf-zoom-info">100%</span>
          <button id="zoom-in">+</button>
        </div>
        <div id="pages-container"></div>
      `;

      // Get the containers and controls
      const pagesContainer = container.querySelector("#pages-container");
      const pdfContainer = this.shadowRoot.querySelector(".pdf-container");
      const prevButton = container.querySelector("#prev-page");
      const nextButton = container.querySelector("#next-page");
      const zoomOutButton = container.querySelector("#zoom-out");
      const zoomInButton = container.querySelector("#zoom-in");
      const currentPageSpan = container.querySelector("#current-page");
      const zoomInfo = container.querySelector(".pdf-zoom-info");

      // Scroll to page function
      const scrollToPage = (pageNum) => {
        const pageElement = pagesContainer.querySelector(
          `[data-page="${pageNum}"]`
        );
        if (pageElement) {
          pdfContainer.scrollTo({
            top: pageElement.offsetTop - container.offsetTop,
            behavior: "smooth",
          });
        }
      };

      // Update page number on scroll
      const updateCurrentPage = () => {
        const pages = Array.from(pagesContainer.querySelectorAll(".pdf-page"));
        const containerRect = pdfContainer.getBoundingClientRect();
        const containerTop = containerRect.top + pdfContainer.scrollTop;

        // Find the page that is most visible in the viewport
        const currentPage = pages.reduce(
          (closest, page) => {
            const rect = page.getBoundingClientRect();
            const visibleHeight =
              Math.min(rect.bottom, containerRect.bottom) -
              Math.max(rect.top, containerRect.top);
            return visibleHeight > closest.visibleHeight
              ? { element: page, visibleHeight }
              : closest;
          },
          { element: pages[0], visibleHeight: 0 }
        ).element;

        const pageNum = parseInt(currentPage.dataset.page);
        currentPageSpan.textContent = pageNum;
        prevButton.disabled = pageNum === 1;
        nextButton.disabled = pageNum === pdf.numPages;
      };

      // Listen for scroll events on the PDF container
      pdfContainer.addEventListener("scroll", updateCurrentPage);

      // Navigation button handlers
      prevButton.addEventListener("click", () => {
        const currentPage = parseInt(currentPageSpan.textContent);
        if (currentPage > 1) {
          scrollToPage(currentPage - 1);
          updateCurrentPage();
        }
      });

      nextButton.addEventListener("click", () => {
        const currentPage = parseInt(currentPageSpan.textContent);
        if (currentPage < pdf.numPages) {
          scrollToPage(currentPage + 1);
          updateCurrentPage();
        }
      });

      // Add keyboard navigation
      pdfContainer.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          nextButton.click();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          prevButton.click();
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
        this.currentZoom = newZoom;
        zoomInfo.textContent = `${Math.round(newZoom * 100)}%`;
        updatePanningState();
        this.renderAllPages(pdf, pagesContainer);
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
      const containerWidth =
        this.shadowRoot.querySelector(".pdf-container").clientWidth - 40;
      const viewport = page.getViewport({ scale: 1 });
      const scale = (containerWidth / viewport.width) * this.currentZoom;
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
    }
  }

  // Add disconnectedCallback to clean up event listeners
  disconnectedCallback() {
    if (this.cleanup) {
      this.cleanup();
    }
  }
}

// Register the custom element with the browser
customElements.define("esign-component", ESIGNComponent);
