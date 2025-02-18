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
    this.sessionDetails = sessionDetails;
    this.sessionDetails.signatureBlocks = [
      { page: 1, position: { x: 25, y: 90 } },
    ];

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

        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        .signature-block {
          position: absolute;
          background: rgba(0, 123, 255, 0.1);
          border: 2px solid #007bff;
          border-radius: 4px;
          padding: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .signature-block:hover {
          background: rgba(0, 123, 255, 0.2);
        }

        .signature-block.required::after {
          content: "*";
          color: #dc3545;
          margin-left: 4px;
        }

        .pdf-page {
          position: relative;  /* For absolute positioning of signature blocks */
        }

        .signature-input-dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 3;
        }

        .signature-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 2;
        }

        .signed-text {
          position: absolute;
          font-family: 'Dancing Script', cursive;
          color: #000;
          font-size: 1.2em;
          padding: 5px;
          background: rgba(0,123,255,0.1);
          border-radius: 4px;
          text-align: center;
          width: 200px;
        }

        .signature-status {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          padding: 10px 15px;
          border-bottom: 1px solid #ccc;
          font-size: 14px;
          text-align: center;
          border-radius: 0 0 4px 4px;
        }

        .signature-block {
          position: relative;
        }

        .signature-block::before {
          content: "Required";
          position: absolute;
          top: -20px;
          left: 0;
          font-size: 12px;
          color: #dc3545;
          opacity: 0.8;
        }

        .signature-block.completed {
          border-color: #28a745;
          background: rgba(40, 167, 69, 0.1);
        }

        .signature-block.completed::before {
          content: "✓ Signed";
          color: #28a745;
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
        <div class="signature-status">
          Signatures: <span id="signatures-complete">0</span>/<span id="signatures-required">0</span>
        </div>
      </div>
    `;

    // Load and render PDF
    this.loadPDFPreview();
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
            body: JSON.stringify({
              templateId: this.templateId,
              signer: this.signerFields,
              documentFields: this.documentFields,
              documentId: this.decodeSessionToken(sessionToken).documentId,
            }),
          }
        );

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

      // Add signature blocks if in dev mode or if they exist in session data
      if (this.devMode) {
        // Mock signature block for dev mode
        if (pageNum === 1) {
          // Only on first page
          const signatureBlock = document.createElement("div");
          signatureBlock.className = "signature-block required";
          signatureBlock.textContent = "Click to sign";
          signatureBlock.style.left = "25%"; // From left
          signatureBlock.style.top = "90%"; // From top
          signatureBlock.style.width = "200px";
          signatureBlock.style.textAlign = "center";
          pageContainer.appendChild(signatureBlock);

          // Add to tracking set
          this.signatureBlocks.add(signatureBlock);

          signatureBlock.addEventListener("click", () => {
            console.log("Signature block clicked");

            // Create overlay and dialog
            const overlay = document.createElement("div");
            overlay.className = "signature-overlay";

            const dialog = document.createElement("div");
            dialog.className = "signature-input-dialog";
            dialog.innerHTML = `
              <h3>Enter your signature</h3>
              <input type="text" placeholder="Type your name" style="margin: 10px 0; padding: 5px;">
              <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                <button class="esign-button" style="background: #6c757d;">Cancel</button>
                <button class="esign-button">Sign</button>
              </div>
            `;

            // Add to DOM
            this.shadowRoot.appendChild(overlay);
            this.shadowRoot.appendChild(dialog);

            // Focus input
            const input = dialog.querySelector("input");
            input.focus();

            // Handle cancel
            const [cancelBtn, signBtn] = dialog.querySelectorAll("button");
            cancelBtn.addEventListener("click", () => {
              overlay.remove();
              dialog.remove();
            });

            // Handle sign
            const handleSign = () => {
              const signedText = input.value.trim();
              if (signedText) {
                // Preserve the original position and size
                const originalLeft = signatureBlock.style.left;
                const originalTop = signatureBlock.style.top;
                const originalWidth = signatureBlock.style.width;

                // Replace signature block with signed text
                signatureBlock.className = "signed-text";
                signatureBlock.textContent = signedText;
                signatureBlock.style.cursor = "default";

                // Restore position and size
                signatureBlock.style.left = originalLeft;
                signatureBlock.style.top = originalTop;
                signatureBlock.style.width = originalWidth;

                // Remove click handler
                signatureBlock.replaceWith(signatureBlock.cloneNode(true));

                // Clean up dialog
                overlay.remove();
                dialog.remove();

                // Add to completed signatures
                this.completedSignatures.add(signatureBlock);

                // Check if all required signatures are complete
                if (this.areAllSignaturesComplete()) {
                  this.startSigning(this.getAttribute("session-token"));
                }

                // Update signature status
                this.updateSignatureStatus();
              }
            };

            signBtn.addEventListener("click", handleSign);
            input.addEventListener("keypress", (e) => {
              if (e.key === "Enter") handleSign();
            });
          });
        }
      } else if (this.sessionDetails?.signatureBlocks) {
        // Handle real signature blocks from session data
        const blocksForThisPage = this.sessionDetails.signatureBlocks.filter(
          (block) => block.page === pageNum
        );

        blocksForThisPage.forEach((block) => {
          const signatureBlock = document.createElement("div");
          signatureBlock.className = `signature-block${
            block.required ? " required" : ""
          }`;
          signatureBlock.textContent = block.label || "Click to sign";
          // signatureBlock.style.left = `${block.position.x}%`;
          // signatureBlock.style.top = `${block.position.y}%`;
          signatureBlock.style.left = "25%"; // From left
          signatureBlock.style.top = "90%"; // From top
          signatureBlock.style.width = "200px";
          // signatureBlock.style.alignSelf = "right"
          signatureBlock.style.textAlign = "center";
          pageContainer.appendChild(signatureBlock);

          // Add to tracking set
          this.signatureBlocks.add(signatureBlock);

          signatureBlock.addEventListener("click", () => {
            console.log("Signature block clicked");

            // Create overlay and dialog
            const overlay = document.createElement("div");
            overlay.className = "signature-overlay";

            const dialog = document.createElement("div");
            dialog.className = "signature-input-dialog";
            dialog.innerHTML = `
              <h3>Enter your signature</h3>
              <input type="text" placeholder="Type your name" style="margin: 10px 0; padding: 5px;">
              <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px;">
                <button class="esign-button" style="background: #6c757d;">Cancel</button>
                <button class="esign-button">Sign</button>
              </div>
            `;

            // Add to DOM
            this.shadowRoot.appendChild(overlay);
            this.shadowRoot.appendChild(dialog);

            // Focus input
            const input = dialog.querySelector("input");
            input.focus();

            // Handle cancel
            const [cancelBtn, signBtn] = dialog.querySelectorAll("button");
            cancelBtn.addEventListener("click", () => {
              overlay.remove();
              dialog.remove();
            });

            // Handle sign
            const handleSign = () => {
              const signedText = input.value.trim();
              if (signedText) {
                // Preserve the original position and size
                const originalLeft = signatureBlock.style.left;
                const originalTop = signatureBlock.style.top;
                const originalWidth = signatureBlock.style.width;

                // Replace signature block with signed text
                signatureBlock.className = "signed-text";
                signatureBlock.textContent = signedText;
                signatureBlock.style.cursor = "default";

                // Restore position and size
                signatureBlock.style.left = originalLeft;
                signatureBlock.style.top = originalTop;
                signatureBlock.style.width = originalWidth;

                // Remove click handler
                signatureBlock.replaceWith(signatureBlock.cloneNode(true));

                // Clean up dialog
                overlay.remove();
                dialog.remove();

                // Add to completed signatures
                this.completedSignatures.add(signatureBlock);

                // Check if all required signatures are complete
                if (this.areAllSignaturesComplete()) {
                  this.startSigning(this.getAttribute("session-token"));
                }

                // Update signature status
                this.updateSignatureStatus();
              }
            };

            signBtn.addEventListener("click", handleSign);
            input.addEventListener("keypress", (e) => {
              if (e.key === "Enter") handleSign();
            });
          });
        });
      }
    }

    // Update signature status
    this.updateSignatureStatus();
  }

  // Add helper method to check if all required signatures are complete
  areAllSignaturesComplete() {
    // In dev mode, just check if any signature is complete (since we only have one)
    if (this.devMode) {
      return this.completedSignatures.size > 0;
    }

    // In production, check that all required signature blocks are signed
    for (const block of this.signatureBlocks) {
      if (
        block.classList.contains("required") &&
        !this.completedSignatures.has(block)
      ) {
        return false;
      }
    }
    return true;
  }

  // Add disconnectedCallback to clean up event listeners
  disconnectedCallback() {
    if (this.cleanup) {
      this.cleanup();
    }
  }

  // Add method to update signature status
  updateSignatureStatus() {
    const statusElement = this.shadowRoot.querySelector(".signature-status");
    const completeCount = this.shadowRoot.querySelector("#signatures-complete");
    const requiredCount = this.shadowRoot.querySelector("#signatures-required");

    const required = this.devMode
      ? 1
      : Array.from(this.signatureBlocks).filter((block) =>
          block.classList.contains("required")
        ).length;

    const completed = this.completedSignatures.size;

    completeCount.textContent = completed;
    requiredCount.textContent = required;

    if (completed === required) {
      statusElement.style.background = "#d4edda";
      statusElement.style.color = "#155724";
    }
  }
}

// Register the custom element with the browser
customElements.define("esign-component", ESIGNComponent);
