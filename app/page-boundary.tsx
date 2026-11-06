'use client';
import {Component,Fragment,type ReactNode} from 'react';
import {isPageLoadError,resetPageLoads} from './page-loader';

type Props={children:ReactNode;resetKey:string;onError:()=>void};
export default class PageBoundary extends Component<Props>{
 state:{error:Error|null;attempt:number;resetKey:string}={error:null,attempt:0,resetKey:this.props.resetKey};
 static getDerivedStateFromError(error:Error){return {error};}
 static getDerivedStateFromProps(props:Props,state:PageBoundary['state']){
  return props.resetKey===state.resetKey?null:{error:null,resetKey:props.resetKey};
 }
 componentDidCatch(error:Error){
  console.error('CRM page failed',error);
  resetPageLoads();
  this.props.onError();
 }
 render(){
  const {error,attempt}=this.state;
  if(error){
   const loading=isPageLoadError(error);
   return <section className="panel" role="alert">
    <h2>{loading?'页面文件未能加载':'当前页面暂时无法显示'}</h2>
    <p>{loading?'网络中断或系统更新可能导致页面文件失效。请重试；若仍未恢复，请刷新系统。':'请重试打开，或先通过左侧导航进入其他页面。'}</p>
    <div className="actions">
     <button className="primary" onClick={()=>this.setState({error:null,attempt:attempt+1})}>重试打开</button>
     <button onClick={()=>window.location.reload()}>刷新系统</button>
    </div>
   </section>;
  }
  return <Fragment key={attempt}>{this.props.children}</Fragment>;
 }
}
