document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('loginForm');
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const loginBtn = document.getElementById('loginBtn');
      const errorMessage = document.getElementById('errorMessage');
      const forgotPasswordLink = document.getElementById('forgotPassword');
      const ssoLoginBtn = document.getElementById('ssoLogin');
      const biometricLoginBtn = document.getElementById('biometricLogin');
      const rememberCheckbox = document.getElementById('remember');
      
      // Load saved credentials if "Remember me" was checked previously
      const savedUsername = localStorage.getItem('sentinel_username');
      const savedRemember = localStorage.getItem('sentinel_remember');
      
      if (savedUsername && savedRemember === 'true') {
        usernameInput.value = savedUsername;
        rememberCheckbox.checked = true;
      }
      
      // Handle Forgot Password link
      forgotPasswordLink.addEventListener('click', function(e) {
        e.preventDefault();
        const email = prompt('Please enter your registered email to reset your password:');
        if (email) {
          alert(`Password reset instructions have been sent to ${email}\nPlease check your email and follow the instructions.`);
          // In a real application, you would make an API call here
        }
      });
      
      // Handle SSO Login
      ssoLoginBtn.addEventListener('click', function() {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Redirecting to SSO...</span>';
        
        // Simulate SSO redirect
        setTimeout(() => {
          alert('Redirecting to Single Sign-On provider...\n(This is a demo - in production this would redirect to your SSO provider)');
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>LOGIN TO DASHBOARD</span>';
        }, 1000);
      });
      
      // Handle Biometric Login
      biometricLoginBtn.addEventListener('click', function() {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-fingerprint"></i><span>Scanning biometric...</span>';
        
        // Simulate biometric authentication
        setTimeout(() => {
          // Simulate success 80% of the time
          if (Math.random() > 0.2) {
            alert('Biometric authentication successful!\nRedirecting to dashboard...');
            // In a real app, you would redirect here
          } else {
            alert('Biometric authentication failed. Please use username/password.');
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>LOGIN TO DASHBOARD</span>';
          }
        }, 1500);
      });
      
      // Handle form submission
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const remember = rememberCheckbox.checked;
        
        // Clear previous errors
        errorMessage.classList.remove('show');
        errorMessage.textContent = '';
        
        // Basic validation
        if (!username || !password) {
          showError('Please enter both username and password');
          return;
        }
        
        if (username.length < 3) {
          showError('Username must be at least 3 characters');
          return;
        }
        
        if (password.length < 6) {
          showError('Password must be at least 6 characters');
          return;
        }
        
        // Show loading state
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Authenticating...</span>';
        
        // Save credentials if "Remember me" is checked
        if (remember) {
          localStorage.setItem('sentinel_username', username);
          localStorage.setItem('sentinel_remember', 'true');
        } else {
          localStorage.removeItem('sentinel_username');
          localStorage.removeItem('sentinel_remember');
        }
        
        // Make API call to backend
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: username,
              password: password
            })
          });
          
          const data = await response.json();
          
          if (response.ok && data.success) {
            // Successful login
            loginBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>Authentication Successful!</span>';
            loginBtn.style.background = 'linear-gradient(to right, #10b981, #059669)';
            
            // Redirect to dashboard
            setTimeout(() => {
              window.location.href = data.redirect || '/dashboard';
            }, 1000);
          } else {
            // Failed login
            showError(data.message || 'Invalid username or password. Please try again.');
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>LOGIN TO DASHBOARD</span>';
            
            // Add shake animation to form
            form.classList.add('shake');
            setTimeout(() => {
              form.classList.remove('shake');
            }, 500);
          }
        } catch (error) {
          console.error('Login error:', error);
          showError('Network error. Please check your connection and try again.');
          loginBtn.disabled = false;
          loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>LOGIN TO DASHBOARD</span>';
        }
      });
      
      function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        
        // Add shake animation
        errorMessage.classList.add('shake');
        setTimeout(() => {
          errorMessage.classList.remove('shake');
        }, 500);
      }
      
      // Add some dynamic background lines
      function createGridLines() {
        const background = document.querySelector('.background-animation');
        
        // Create horizontal lines
        for (let i = 0; i < 20; i++) {
          const line = document.createElement('div');
          line.className = 'grid-line horizontal';
          line.style.top = `${i * 5}%`;
          line.style.animationDelay = `${i * 0.5}s`;
          background.appendChild(line);
        }
        
        // Create vertical lines
                for (let i = 0; i < 20; i++) {
                  const line = document.createElement('div');
                  line.className = 'grid-line vertical';
                  line.style.left = `${i * 5}%`;
                  line.style.animationDelay = `${i * 0.5}s`;
                  background.appendChild(line);
                }
              }
              
              createGridLines();
            });