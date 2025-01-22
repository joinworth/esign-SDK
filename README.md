# ESIGN SDK

A lightweight JavaScript library that provides a custom web component `<esign-component>` for embedding ESIGN workflows into your web applications.

## Live Demo

Check out the [live demo](https://joinworth.github.io/esign-SDK/example.html)

## Features

- Simple integration with just a few lines of code.
- Customizable attributes for API key and document ID.
- Secure interaction with ESIGN APIs using API keys.
- Built-in UI for initiating signing workflows.
- Developer mode for testing and development

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
curl -X POST https://api.esign.com/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
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
    }
  }'
```

Response:

```json
{
  "sessionToken": "eyJhbGciOiJIUzI1...",
  "expiresAt": "2024-03-21T12:00:00Z"
}
```

The session token is a short-lived JWT that contains all signing session details and expires after 2 hours.

### Step 3: Add the Web Component

```html
<!-- Basic Usage - All signer and document data is encoded in the session token -->
<esign-component session-token="your-jwt-token" dev-mode></esign-component>
```

### Available Attributes

| Attribute        | Required | Description                        |
| ---------------- | -------- | ---------------------------------- |
| session-token    | Yes      | JWT token from the session API     |
| template-id      | No       | ID of the document template to use |
| full-legal-name  | No       | Legal name of the signing entity   |
| signer-email     | No       | Email of the signer                |
| signer-full-name | No       | Full name of the signer            |
| signer-title     | No       | Title/position of the signer       |
| address-1        | No       | Primary address line               |
| address-2        | No       | Secondary address line             |
| city             | No       | City                               |
| state            | No       | State/Province                     |
| zip              | No       | ZIP/Postal code                    |
| tin              | No       | Tax Identification Number          |
| dev-mode         | No       | Enable development mode            |

### Security Considerations

- Always generate session tokens on the backend
- Use short expiration times for session tokens (15-30 minutes recommended)
- Never expose your JWT signing secret in client-side code
- Use HTTPS for all API communications

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
