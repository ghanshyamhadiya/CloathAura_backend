import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    
  tls: {
    rejectUnauthorized: true
  },
  connectionTimeout: 20000, 
  greetingTimeout: 20000,
  socketTimeout: 20000,
  logger: true,
  debug: true
});

transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP configuration error:', error);
    } else {
        console.log('SMTP server is ready to send emails');
    }
});

// Enhanced Email Verification Template - Luxury Fashion Theme
export const sendEmailVerification = async (to, token, username) => {
    const verificationUrl = `${process.env.CLIENT_URL}/email-verification/${token}`;
    
    const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.SMTP_USER}>`,
        to,
        subject: '✨ Welcome to Luxury Fashion - Verify Your Email',
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.6; 
            color: #2c2c2c;
            background: linear-gradient(135deg, #1a1a1a 0%, #3d3d3d 100%);
            padding: 20px;
        }
        .email-wrapper {
            max-width: 650px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 0;
            overflow: hidden;
            box-shadow: 0 25px 70px rgba(0,0,0,0.5);
            border: 1px solid #d4af37;
        }
        .header {
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            padding: 50px 30px;
            text-align: center;
            position: relative;
            border-bottom: 3px solid #d4af37;
        }
        .header::after {
            content: '';
            position: absolute;
            bottom: -3px;
            left: 50%;
            transform: translateX(-50%);
            width: 100px;
            height: 3px;
            background: linear-gradient(90deg, transparent, #d4af37, transparent);
        }
        .logo {
            width: 90px;
            height: 90px;
            background: linear-gradient(135deg, #d4af37 0%, #f4e4b8 100%);
            border-radius: 50%;
            margin: 0 auto 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 45px;
            box-shadow: 0 15px 40px rgba(212, 175, 55, 0.4);
            border: 3px solid #fff;
        }
        .header h1 {
            color: #d4af37;
            font-size: 32px;
            font-weight: 300;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin: 0 0 15px 0;
            font-family: 'Garamond', serif;
        }
        .tagline {
            color: #b8b8b8;
            font-size: 14px;
            font-style: italic;
            letter-spacing: 1px;
            font-family: 'Georgia', serif;
        }
        .content {
            padding: 50px 40px;
            background: #fafafa;
        }
        .quote-section {
            text-align: center;
            padding: 30px 20px;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            margin: -50px -40px 40px -40px;
            border-bottom: 2px solid #d4af37;
        }
        .quote {
            color: #d4af37;
            font-size: 20px;
            font-style: italic;
            font-weight: 300;
            line-height: 1.6;
            font-family: 'Georgia', serif;
            margin-bottom: 10px;
        }
        .quote-author {
            color: #b8b8b8;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .greeting {
            font-size: 26px;
            color: #1a1a1a;
            font-weight: 400;
            margin-bottom: 25px;
            font-family: 'Garamond', serif;
        }
        .message {
            font-size: 16px;
            color: #4a4a4a;
            margin-bottom: 25px;
            line-height: 1.9;
            font-family: 'Georgia', serif;
        }
        .button-container {
            text-align: center;
            margin: 45px 0;
        }
        .verify-button {
            display: inline-block;
            padding: 18px 50px;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #d4af37;
            text-decoration: none;
            border-radius: 0;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: 2px;
            text-transform: uppercase;
            border: 2px solid #d4af37;
            transition: all 0.4s ease;
            font-family: 'Arial', sans-serif;
        }
        .verify-button:hover {
            background: #d4af37;
            color: #1a1a1a;
            transform: translateY(-3px);
            box-shadow: 0 15px 40px rgba(212, 175, 55, 0.3);
        }
        .divider {
            text-align: center;
            margin: 35px 0;
            position: relative;
        }
        .divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(to right, transparent, #d4af37, transparent);
        }
        .divider span {
            background: #fafafa;
            padding: 0 20px;
            color: #888;
            font-size: 12px;
            letter-spacing: 2px;
            position: relative;
            z-index: 1;
            font-weight: 600;
        }
        .link-box {
            background: #fff;
            border: 2px solid #d4af37;
            border-radius: 0;
            padding: 20px;
            word-break: break-all;
            font-size: 13px;
            color: #1a1a1a;
            margin: 25px 0;
            font-family: 'Courier New', monospace;
        }
        .info-box {
            background: linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%);
            border-left: 4px solid #d4af37;
            padding: 20px;
            margin: 30px 0;
            border-radius: 0;
        }
        .info-box p {
            margin: 0;
            color: #6b5d3f;
            font-size: 14px;
            font-family: 'Georgia', serif;
        }
        .features {
            display: table;
            width: 100%;
            margin: 40px 0;
            background: #fff;
            padding: 30px;
            border: 1px solid #e8e8e8;
        }
        .feature {
            display: table-row;
        }
        .feature-icon {
            display: table-cell;
            width: 60px;
            vertical-align: top;
            padding: 15px 15px 15px 0;
            font-size: 28px;
        }
        .feature-text {
            display: table-cell;
            vertical-align: top;
            padding: 15px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .feature:last-child .feature-text {
            border-bottom: none;
        }
        .feature-text h3 {
            color: #1a1a1a;
            font-size: 17px;
            margin-bottom: 8px;
            font-weight: 500;
            font-family: 'Garamond', serif;
        }
        .feature-text p {
            color: #666;
            font-size: 14px;
            margin: 0;
            line-height: 1.6;
        }
        .footer {
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            padding: 40px 30px;
            text-align: center;
            border-top: 3px solid #d4af37;
        }
        .footer p {
            margin: 10px 0;
            color: #b8b8b8;
            font-size: 13px;
        }
        .footer a {
            color: #d4af37;
            text-decoration: none;
            transition: color 0.3s ease;
        }
        .footer a:hover {
            color: #f4e4b8;
        }
        .social-links {
            margin: 25px 0;
        }
        .social-links a {
            display: inline-block;
            width: 40px;
            height: 40px;
            line-height: 40px;
            background: transparent;
            color: #d4af37;
            border: 2px solid #d4af37;
            border-radius: 50%;
            margin: 0 8px;
            text-decoration: none;
            transition: all 0.3s ease;
            font-weight: bold;
        }
        .social-links a:hover {
            background: #d4af37;
            color: #1a1a1a;
            transform: translateY(-3px);
        }
        
        @media only screen and (max-width: 600px) {
            body { padding: 10px; }
            .email-wrapper { border-radius: 0; }
            .header { padding: 35px 20px; }
            .header h1 { font-size: 26px; letter-spacing: 2px; }
            .content { padding: 35px 25px; }
            .quote-section { padding: 25px 15px; margin: -35px -25px 30px -25px; }
            .quote { font-size: 18px; }
            .greeting { font-size: 22px; }
            .message { font-size: 15px; }
            .verify-button { 
                padding: 16px 35px;
                font-size: 14px;
                display: block;
                width: 100%;
            }
            .features { display: block; padding: 20px; }
            .feature { display: block; margin-bottom: 25px; }
            .feature-icon, .feature-text { display: block; width: 100%; padding: 5px 0; }
            .feature-text { border-bottom: 1px solid #f0f0f0; padding-bottom: 20px; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
    
        <div class="content">
            <div class="quote-section">
                <p class="quote">"Fashion is about dressing according to what's fashionable. Style is more about being yourself."</p>
                <p class="quote-author">— Oscar de la Renta</p>
            </div>
            
            <p class="greeting">Welcome, ${username}! ✨</p>
            
            <p class="message">
                We are delighted to have you join our exclusive fashion community. You're about to embark on a style journey where luxury meets individuality, and every piece tells your unique story.
            </p>
            
            <p class="message">
                To unlock your personalized shopping experience and gain access to exclusive collections, please verify your email address:
            </p>
            
            <div class="button-container">
                <a href="${verificationUrl}" class="verify-button">Verify Email Address</a>
            </div>
            
            <div class="divider"><span>ALTERNATIVE METHOD</span></div>
            
            <p style="text-align: center; color: #666; font-size: 14px; margin-bottom: 15px;">
                Or copy this secure link to your browser:
            </p>
            <div class="link-box">${verificationUrl}</div>
            
            <div class="info-box">
                <p><strong>⏰ Security Notice:</strong> This verification link expires in 1 hour to protect your account.</p>
            </div>
            
            <div class="features">
                <div class="feature">
                    <div class="feature-icon">🎁</div>
                    <div class="feature-text">
                        <h3>Exclusive Member Benefits</h3>
                        <p>Early access to new collections, limited editions, and members-only sales</p>
                    </div>
                </div>
                <div class="feature">
                    <div class="feature-icon">💎</div>
                    <div class="feature-text">
                        <h3>Premium Shopping Experience</h3>
                        <p>Personalized recommendations, style consultations, and priority support</p>
                    </div>
                </div>
                <div class="feature">
                    <div class="feature-icon">🚚</div>
                    <div class="feature-text">
                        <h3>Complimentary Services</h3>
                        <p>Free express shipping, hassle-free returns, and luxury gift packaging</p>
                    </div>
                </div>
            </div>
            
            <p class="message" style="margin-top: 35px; font-size: 13px; color: #999; text-align: center; font-style: italic;">
                Didn't create an account? Please disregard this email.
            </p>
        </div>
        
        <div class="footer">
            <p style="font-weight: 600; color: #d4af37; margin-bottom: 20px; font-size: 15px; letter-spacing: 2px;">STAY CONNECTED</p>
            <div class="social-links">
                <a href="#" title="Facebook">f</a>
                <a href="#" title="Instagram">ig</a>
                <a href="#" title="Pinterest">p</a>
                <a href="#" title="Twitter">t</a>
            </div>
            <p style="margin-top: 25px;">
                <strong style="color: #d4af37;">Need Assistance?</strong><br>
                Our style experts are here 24/7<br>
                <a href="mailto:support@fashionelegance.com">support@fashionelegance.com</a>
            </p>
            <p style="margin-top: 20px; font-size: 11px; color: #888; line-height: 1.8;">
                © 2024 Fashion Elegance. All rights reserved.<br>
                Luxury Fashion District, 5th Avenue, New York, NY 10001
            </p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error(`Failed to send email: ${error.message}`);
    }
};

// Enhanced Password Reset Email Template - Luxury Fashion Theme
export const sendPasswordResetEmail = async (to, token, username) => {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    
    const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.SMTP_USER}>`,
        to,
        subject: '🔐 Secure Password Reset - Fashion Elegance',
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.6; 
            color: #2c2c2c;
            background: linear-gradient(135deg, #2d1b00 0%, #5d3a1a 100%);
            padding: 20px;
        }
        .email-wrapper {
            max-width: 650px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 0;
            overflow: hidden;
            box-shadow: 0 25px 70px rgba(0,0,0,0.5);
            border: 1px solid #c89b5f;
        }
        .header {
            background: linear-gradient(135deg, #2d1b00 0%, #4a2f0f 100%);
            padding: 50px 30px;
            text-align: center;
            position: relative;
            border-bottom: 3px solid #c89b5f;
        }
        .logo {
            width: 90px;
            height: 90px;
            background: linear-gradient(135deg, #c89b5f 0%, #e8c49f 100%);
            border-radius: 50%;
            margin: 0 auto 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 45px;
            box-shadow: 0 15px 40px rgba(200, 155, 95, 0.4);
            border: 3px solid #fff;
        }
        .header h1 {
            color: #c89b5f;
            font-size: 30px;
            font-weight: 300;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin: 0;
            font-family: 'Garamond', serif;
        }
        .content {
            padding: 50px 40px;
            background: #fafafa;
        }
        .quote-section {
            text-align: center;
            padding: 30px 20px;
            background: linear-gradient(135deg, #2d1b00 0%, #4a2f0f 100%);
            margin: -50px -40px 40px -40px;
            border-bottom: 2px solid #c89b5f;
        }
        .quote {
            color: #c89b5f;
            font-size: 19px;
            font-style: italic;
            font-weight: 300;
            line-height: 1.6;
            font-family: 'Georgia', serif;
            margin-bottom: 10px;
        }
        .quote-author {
            color: #b8a088;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .greeting {
            font-size: 26px;
            color: #2d1b00;
            font-weight: 400;
            margin-bottom: 25px;
            font-family: 'Garamond', serif;
        }
        .message {
            font-size: 16px;
            color: #4a4a4a;
            margin-bottom: 25px;
            line-height: 1.9;
            font-family: 'Georgia', serif;
        }
        .button-container {
            text-align: center;
            margin: 45px 0;
        }
        .reset-button {
            display: inline-block;
            padding: 18px 50px;
            background: linear-gradient(135deg, #2d1b00 0%, #4a2f0f 100%);
            color: #c89b5f;
            text-decoration: none;
            border-radius: 0;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: 2px;
            text-transform: uppercase;
            border: 2px solid #c89b5f;
            transition: all 0.4s ease;
            font-family: 'Arial', sans-serif;
        }
        .reset-button:hover {
            background: #c89b5f;
            color: #2d1b00;
            transform: translateY(-3px);
            box-shadow: 0 15px 40px rgba(200, 155, 95, 0.3);
        }
        .divider {
            text-align: center;
            margin: 35px 0;
            position: relative;
        }
        .divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(to right, transparent, #c89b5f, transparent);
        }
        .divider span {
            background: #fafafa;
            padding: 0 20px;
            color: #888;
            font-size: 12px;
            letter-spacing: 2px;
            position: relative;
            z-index: 1;
            font-weight: 600;
        }
        .link-box {
            background: #fff;
            border: 2px solid #c89b5f;
            border-radius: 0;
            padding: 20px;
            word-break: break-all;
            font-size: 13px;
            color: #2d1b00;
            margin: 25px 0;
            font-family: 'Courier New', monospace;
        }
        .warning-box {
            background: linear-gradient(135deg, #fff5e6 0%, #fff9f0 100%);
            border-left: 4px solid #c89b5f;
            padding: 20px;
            margin: 30px 0;
            border-radius: 0;
        }
        .warning-box p {
            margin: 0;
            color: #6b4d2f;
            font-size: 14px;
            font-family: 'Georgia', serif;
        }
        .security-tips {
            background: #fff;
            border: 1px solid #e8e8e8;
            border-radius: 0;
            padding: 30px;
            margin: 30px 0;
        }
        .security-tips h3 {
            color: #2d1b00;
            font-size: 18px;
            margin-bottom: 20px;
            font-family: 'Garamond', serif;
            border-bottom: 2px solid #c89b5f;
            padding-bottom: 10px;
        }
        .security-tips ul {
            margin: 0;
            padding-left: 25px;
        }
        .security-tips li {
            color: #555;
            font-size: 14px;
            margin-bottom: 12px;
            line-height: 1.6;
        }
        .alert-box {
            background: linear-gradient(135deg, #fff0f0 0%, #ffe8e8 100%);
            border: 2px solid #d88;
            padding: 20px;
            margin: 30px 0;
            border-radius: 0;
        }
        .footer {
            background: linear-gradient(135deg, #2d1b00 0%, #4a2f0f 100%);
            padding: 40px 30px;
            text-align: center;
            border-top: 3px solid #c89b5f;
        }
        .footer p {
            margin: 10px 0;
            color: #b8a088;
            font-size: 13px;
        }
        .footer a {
            color: #c89b5f;
            text-decoration: none;
            transition: color 0.3s ease;
        }
        .footer a:hover {
            color: #e8c49f;
        }
        
        @media only screen and (max-width: 600px) {
            body { padding: 10px; }
            .email-wrapper { border-radius: 0; }
            .header { padding: 35px 20px; }
            .header h1 { font-size: 26px; letter-spacing: 2px; }
            .content { padding: 35px 25px; }
            .quote-section { padding: 25px 15px; margin: -35px -25px 30px -25px; }
            .quote { font-size: 17px; }
            .greeting { font-size: 22px; }
            .message { font-size: 15px; }
            .reset-button { 
                padding: 16px 35px;
                font-size: 14px;
                display: block;
                width: 100%;
            }
            .security-tips { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <div class="logo">🔐</div>
            <h1>Password Reset</h1>
        </div>
        
        <div class="content">
            <div class="quote-section">
                <p class="quote">"Elegance is not about being noticed, it's about being remembered."</p>
                <p class="quote-author">— Giorgio Armani</p>
            </div>
            
            <p class="greeting">Hello ${username},</p>
            
            <p class="message">
                We received your request to reset your password. Your account security is our highest priority, and we're here to help you regain access quickly and safely.
            </p>
            
            <p class="message">
                Click the secure button below to create your new password:
            </p>
            
            <div class="button-container">
                <a href="${resetUrl}" class="reset-button">Reset Password</a>
            </div>
            
            <div class="divider"><span>ALTERNATIVE METHOD</span></div>
            
            <p style="text-align: center; color: #666; font-size: 14px; margin-bottom: 15px;">
                Or copy this secure link to your browser:
            </p>
            <div class="link-box">${resetUrl}</div>
            
            <div class="warning-box">
                <p><strong>⏰ Time Sensitive:</strong> This secure reset link will expire in 1 hour to protect your account.</p>
            </div>
            
            <div class="security-tips">
                <h3>🛡️ Password Security Guidelines</h3>
                <ul>
                    <li>Create a strong password with minimum 12 characters</li>
                    <li>Combine uppercase letters, lowercase letters, numbers, and special symbols</li>
                    <li>Avoid using personal information or common words</li>
                    <li>Never share your password with anyone, including our staff</li>
                    <li>Consider using a reputable password manager for enhanced security</li>
                    <li>Enable two-factor authentication for additional protection</li>
                </ul>
            </div>
            
            <div class="alert-box">
                <p style="color: #c33; font-size: 14px; font-weight: 600; margin-bottom: 10px;">⚠️ Didn't Request This Reset?</p>
                <p style="color: #555; font-size: 14px; margin: 0; line-height: 1.7;">
                    If you didn't request a password reset, please ignore this email. Your password will remain unchanged and your account is secure. However, if you're concerned about unauthorized access, please contact our security team immediately.
                </p>
            </div>
            
            <p class="message" style="margin-top: 30px; font-size: 14px; color: #666; text-align: center; padding: 20px; background: #fff; border: 1px solid #e8e8e8;">
                <strong style="color: #2d1b00;">Need Assistance?</strong><br>
                Our dedicated support team is available 24/7 to help you<br>
                <a href="mailto:security@fashionelegance.com" style="color: #c89b5f; text-decoration: none;">security@fashionelegance.com</a>
            </p>
        </div>
        
        <div class="footer">
            <p style="font-weight: 600; color: #c89b5f; font-size: 15px; letter-spacing: 2px; margin-bottom: 15px;">FASHION ELEGANCE</p>
            <p style="margin-top: 20px;">
                <strong style="color: #c89b5f;">Customer Care</strong><br>
                Available 24/7 for your convenience<br>
                <a href="mailto:support@fashionelegance.com">support@fashionelegance.com</a>
            </p>
            <p style="margin-top: 25px; font-size: 11px; color: #888; line-height: 1.8;">
                © 2024 Fashion Elegance. All rights reserved.<br>
                Luxury Fashion District, 5th Avenue, New York, NY 10001
            </p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw new Error(`Failed to send password reset email: ${error.message}`);
    }
};
