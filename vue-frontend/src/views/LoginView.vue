<template>
  <div class="login-container">
    <div class="login-box">
      <h1>ZZZ-设备控制</h1>
      <h2>登录</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">用户名</label>
          <input 
            type="text" 
            id="username" 
            v-model="username" 
            placeholder="请输入用户名"
            required
          />
        </div>
        <div class="form-group">
          <label for="password">密码</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            placeholder="请输入密码"
            required
          />
        </div>
        <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
        <button type="submit" class="login-btn">登录</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const username = ref('');
const password = ref('');
const errorMessage = ref('');

// Default credentials
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

const handleLogin = () => {
  errorMessage.value = '';
  
  if (username.value === DEFAULT_USERNAME && password.value === DEFAULT_PASSWORD) {
    // Store auth state
    sessionStorage.setItem('isAuthenticated', 'true');
    sessionStorage.setItem('username', username.value);
    
    // Redirect to home
    router.push({ name: 'home' });
  } else {
    errorMessage.value = '用户名或密码错误';
  }
};
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-box {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.login-box h1 {
  color: #00d9ff;
  text-align: center;
  font-size: 2rem;
  margin-bottom: 8px;
  letter-spacing: 2px;
}

.login-box h2 {
  color: #fff;
  text-align: center;
  font-size: 1.2rem;
  margin-bottom: 30px;
  font-weight: normal;
  opacity: 0.8;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  color: #fff;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 1rem;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #00d9ff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 3px rgba(0, 217, 255, 0.1);
}

.form-group input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.error-message {
  color: #ff6b6b;
  text-align: center;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 217, 255, 0.4);
}

.login-btn:active {
  transform: translateY(0);
}
</style>
