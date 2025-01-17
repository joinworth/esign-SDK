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

On your backend, make a request to the ESIGN API service to generate a session token:

```javascript
// Example backend code (Node.js)
async function getSigningSession(apiKey, documentId, userId) {
  try {
    const response = await fetch("https://api.esign.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        documentId,
        userId,
        expiresIn: "15m", // Request 15-minute session
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate signing session");
    }

    const { sessionToken } = await response.json();
    return sessionToken;
  } catch (error) {
    console.error("Error generating signing session:", error);
    throw error;
  }
}

// Example usage

const apiKey = process.env.ESIGN_API_KEY;

const sessionToken = await getSigningSession(apiKey, documentId, userId);
```

The session token returned by the API is a short-lived JWT that can be safely passed to the frontend. This token will expire after 15 minutes and can only be used for the specified document and user.

### Step 3: Add the Web Component

```html
<!-- Production Mode -->
<esign-component session-token="your-jwt-token" document-id="12345">
</esign-component>

<!-- Developer Mode -->
<esign-component session-token="your-jwt-token" document-id="12345" dev-mode>
</esign-component>
```

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
