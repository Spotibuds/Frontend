# Spotibuds Frontend

A modern, responsive frontend for the Spotibuds music social platform built with Next.js 15, React 19, and Tailwind CSS.

## 🚀 Features

- **Modern UI/UX**: Beautiful dark theme with gradient effects
- **Authentication**: Complete login/register system with JWT tokens
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Type Safety**: Full TypeScript implementation
- **Performance**: Optimized build with Next.js 15 and Turbopack
- **Security**: ReCAPTCHA integration and secure API calls
- **Accessibility**: WCAG compliant components

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Runtime**: React 19
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Icons**: Heroicons + Lucide React
- **Security**: ReCAPTCHA v2
- **Build Tool**: Turbopack (development)

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd spotibuds/Frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Dashboard page
│   ├── register/          # Registration page
│   ├── layout.tsx         # Root layout
│   ├── page.tsx          # Home/login page
│   └── globals.css       # Global styles
├── components/
│   └── ui/               # Reusable UI components
│       ├── Button.tsx    # Button component
│       ├── Card.tsx      # Card components
│       └── Input.tsx     # Input component
└── lib/
    ├── api.ts           # API functions and types
    └── utils.ts         # Utility functions
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically

## 🌐 API Integration

The frontend communicates with three microservices:

- **Identity API** (Port 5001): Authentication and user management
- **Music API** (Port 5002): Songs, artists, albums, playlists
- **User API** (Port 5003): User relationships and social features

## 🎨 Styling

- **Tailwind CSS v4**: Latest version with improved performance
- **Custom Design System**: Consistent colors, spacing, and typography
- **Dark Theme**: Modern dark UI with purple accent colors
- **Responsive Design**: Mobile-first approach
- **Custom Components**: Reusable UI components with variants

## 🔒 Security

- **JWT Authentication**: Secure token-based authentication
- **ReCAPTCHA**: Bot protection on registration
- **Input Validation**: Client and server-side validation
- **XSS Protection**: Sanitized inputs and outputs
- **CSRF Protection**: Built-in Next.js protections

## 🚀 Performance

- **Bundle Size**: Optimized chunks (~101kB First Load JS)
- **Font Optimization**: Google Fonts with fallbacks
- **Image Optimization**: Next.js built-in image optimization
- **Code Splitting**: Automatic route-based splitting
- **Static Generation**: Pre-rendered static pages where possible

## 🧪 Code Quality

- **TypeScript**: Full type safety
- **ESLint**: Code linting with Next.js rules
- **Prettier**: Code formatting (recommended)
- **Strict Mode**: TypeScript strict mode enabled
- **Modern Standards**: ES2017+ target

## 📱 Browser Support

- Chrome 64+
- Firefox 78+
- Safari 12+
- Edge 79+

## 🤝 Contributing

1. Follow the existing code style
2. Use TypeScript strictly
3. Add proper error handling
4. Write meaningful commit messages
5. Test your changes thoroughly

## 📄 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_IDENTITY_API` | Identity service URL | Yes |
| `NEXT_PUBLIC_MUSIC_API` | Music service URL | Yes |
| `NEXT_PUBLIC_USER_API` | User service URL | Yes |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | ReCAPTCHA site key | Yes |

## 🐛 Troubleshooting

### Common Issues

1. **Build Errors**
   - Clear `.next` folder: `rm -rf .next`
   - Reinstall dependencies: `rm -rf node_modules && npm install`

2. **Font Loading Issues**
   - Check network connectivity
   - Fonts have fallbacks configured

3. **API Connection Issues**
   - Verify environment variables
   - Check if backend services are running

## 📚 Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs) 