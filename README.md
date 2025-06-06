# ESIGN SDK

A lightweight JavaScript library that provides a custom web component `<esign-component>` for embedding ESIGN workflows into your web applications.

## Live Demo

Check out the [live demo](https://joinworth.github.io/esign-SDK/example.html)

## Purpose

- Simple integration with just a few lines of code.
- Customizable attributes for API key and document ID.
- Secure interaction with ESIGN APIs using API keys.
- Built-in UI for initiating signing workflows.
- Developer mode for testing and development

## End User Features

### Document Viewing

- Smooth PDF preview with multi-page support
- Zoom controls to adjust document size (+ and - buttons)
- Page navigation with Previous/Next buttons
- Current page indicator showing position in document

### Signature Capabilities

- Support for multiple signature blocks per document
- Required vs optional signature indicators
- Visual signature status tracking
- Signature completion progress bar
- Click-to-sign interface with signature input dialog
- Signature validation and verification

### User Experience

- Responsive design that works across devices
- Clear visual indicators for required signatures
- Real-time status updates on signature progress
- Error handling with user-friendly messages
- Development mode for testing workflows

## How It Works

1. Developers include the ESIGN SDK in their application.
2. Add the `<esign-component>` web component to the HTML with `api-key` and `document-id` attributes.
3. The component interacts with your backend ESIGN API to trigger the signing process and provide status feedback.

## Implementation Guide

### Step 1: Include the ESIGN SDK

#### Option 1: CDN

```html
<script src="https://cdn.jsdelivr.net/gh/joinworth/esign-SDK@1.0.0/esign-sdk.js"></script>
```

### Step 2: Generate a Session Token

First, get a session token from the ESIGN API using your API key:

```bash
curl -X POST https://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "templateId": "irs_8821",
    "signer": {
      "id": "user_123",
      "email": "john@example.com",
      "fullName": "John Smith",
      "title": "CEO"
    },
    "documentFields": {
      "legalName": "Acme Corp LLC",
      "addressLine1": "123 Main St",
      "addressLine2": "Suite 100",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94105",
      "taxId": "12-3456789"
    }
  }'
```

Response:

```json
{
  "status": "success",
  "message": "Session created successfully",
  "data": {
    "sessionToken": "mock_wmi508",
    "expiresAt": "2025-01-24T22:59:59.492Z",
    "documentId": "doc_9m3dr9",
    "templateId": "template_123",
    "signer": {
      "id": "user_123",
      "email": "john@example.com",
      "fullName": "John Smith",
      "title": "CEO"
    },
    "documentFields": {
      "legalName": "Acme Corp LLC",
      "addressLine1": "123 Main St",
      "addressLine2": "Suite 100",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94105",
      "taxId": "12-3456789"
    },
    "signatureBlocks": [
      {
        "id": "sig_block_1",
        "type": "signature",
        "page": 1,
        "position": {
          "x": 25.5, // Percentage from left
          "y": 75.2 // Percentage from top
        },
        "required": true,
        "label": "Taxpayer Signature"
      }
    ]
  }
}
```

The response includes:

- Session token and expiration
- Document and template IDs
- Signer information
- Document fields
- Signature block locations and requirements:
  - `page`: The page number where the signature block appears
  - `position`: X,Y coordinates as percentages of page width/height
  - `type`: Type of signature block (signature, date, initial, etc.)
  - `required`: Whether this signature is required
  - `label`: Description of the signature block

### Step 3: Add the Web Component

```html
<!-- Basic Usage - All signer and document data is encoded in the session token -->
<esign-component
  session-token="your-jwt-token"
  service-url="https://your-domain.com/api/esign"
  dev-mode
></esign-component>
```

### Configuration

| Attribute     | Required | Default                  | Description                    |
| ------------- | -------- | ------------------------ | ------------------------------ |
| session-token | Yes      | -                        | JWT token from the session API |
| service-url   | No       | https://api.esign.com/v1 | Base URL for the signing API   |
| dev-mode      | No       | false                    | Enable development mode        |

### Security Considerations

- Always generate session tokens on the backend
- Never expose your API KEY in client-side code

### Developer Mode

When the `dev-mode` attribute is present, the SDK will:

- Display a "Dev Mode" indicator
- Mock the signing API calls
- Return simulated successful responses
- Log actions to the console

This is useful for:

- Development and testing
- UI integration work
- Demos and presentations

### Events

The component emits the following custom events:

| Event Name       | Detail                                   | Description                                  |
| ---------------- | ---------------------------------------- | -------------------------------------------- |
| signing-complete | `{ status, documentId, timestamp, ... }` | Fired when signing is completed successfully |
| signing-error    | `{ error }`                              | Fired when an error occurs during signing    |

Example usage:

```javascript
document
  .querySelector("esign-component")
  .addEventListener("signing-complete", (event) => {
    console.log("Signing completed:", event.detail);
    // Handle successful signing...
  });

document
  .querySelector("esign-component")
  .addEventListener("signing-error", (event) => {
    console.error("Signing error:", event.detail.error);
    // Handle error...
  });
```

### Flow Diagram

```mermaid
sequenceDiagram
  participant Client as Client App
  participant ClientBackend as Client Backend
  participant SDK as ESIGN Component
  participant Backend as ESIGN Service
  participant Storage as Document Storage


Note over Client: User loads signature page
  Client ->> ClientBackend: Request session token
  ClientBackend ->> Backend: POST /v1/sessions (with template_id and api secret)
  Backend -->> ClientBackend: Return session token
  ClientBackend -->> Client: Return session token
  Client ->> SDK: Initialize component with session token
  SDK ->> Backend: Retrieve template document
  Backend -->> SDK: Return template document
  SDK ->> SDK: Render signing interface with template
  Note over SDK: User clicks "Sign"
  SDK ->> Backend: POST /v1/sign (session token)
  Backend ->> Backend: Generate document from template
  Backend ->> Storage: Store signed document
  Storage -->> Backend: Document URL
  Backend -->> SDK: Success response
  SDK ->> Client: Dispatch signing-complete event
  Client -->> Client: Handle signing completion
  Backend -->> ClientBackend: Upload document to Tax OCR (business_id)
```

This diagram shows:

1. Initial session creation with document fields
2. SDK initialization and validation
3. User-triggered signing process
4. Document generation and storage
5. Event handling and completion
