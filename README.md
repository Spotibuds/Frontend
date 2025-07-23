# Spotibuds Frontend

A Next.js frontend application for the Spotibuds music platform.

## Features

- User authentication (register, login, logout)
- Music discovery and management
- User profiles and privacy settings
- Follow/unfollow system

## Environment Variables

The following environment variables are configured in Azure App Service:

- `NEXT_PUBLIC_IDENTITY_API`: Identity service URL
- `NEXT_PUBLIC_MUSIC_API`: Music service URL  
- `NEXT_PUBLIC_USER_API`: User service URL
- `NODE_ENV`: Environment (production/development)

## Password Requirements

When registering, passwords must meet the following requirements:
- At least 8 characters long
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

## Development

```bash
npm install
npm run dev
```

## Deployment

The application is containerized and deployed to Azure App Service using Azure Container Registry. 