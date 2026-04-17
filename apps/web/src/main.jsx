import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

class GlobalErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, err: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, err: error }; }
  componentDidCatch(error, info) { this.setState({ err: error, info }); console.error(error); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{color: 'red', padding: '20px', background: '#0e0e10', height: '100vh', width: '100vw', overflowY: 'auto', zIndex: 9999}}>
          <h1>Frontend Crash</h1>
          <pre>{this.state.err && this.state.err.toString()}</pre>
          <pre>{this.state.info && this.state.info.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>,
);
