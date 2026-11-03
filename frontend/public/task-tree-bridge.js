/* Connect the shared task-tree element to the project editor. */
export function connectOriginalTree(host, environment) {
  const native=host.renderer;
  const {document,NODES,STATUS,WEEK,BORDER,THEME,SVG,svg,circles,labelLayer,ancestors,inside,fill,stroke,show,open,labels}=native;
  const observers=[];
  const observe=(callback,target,options)=>{const observer=new MutationObserver(callback);observer.observe(target,options);observers.push(observer);};
  document.documentElement.style.setProperty('--tree-focus',WEEK['this'][1]);
  const legend=document.createElement('details');legend.className='tree-legend';
  const legendLabel=document.createElement('summary');legendLabel.textContent='Legend';legend.appendChild(legendLabel);
  const originalLegend=document.querySelector('body>main>aside');originalLegend.before(legend);legend.appendChild(originalLegend);
  const narrow=matchMedia('(max-width:48rem)');const legendLayout=()=>{legend.open=!narrow.matches;};legendLayout();narrow.addEventListener('change',legendLayout);
  const chart=document.getElementById('chart');
  const chartRatio=()=>{const box=svg.viewBox.baseVal;if(box.width>0&&box.height>0)chart.style.setProperty('--diagram-aspect',String(box.width/box.height));};
  observe(chartRatio,svg,{attributes:true,attributeFilter:['viewBox']});chartRatio();
  let timer,generation=0,applied=new URL(environment.url,location.href).href,requested='',hostReference,loading='';
  let identities=new Map(),pendingIdentities=new Map();
  let navigation=0,appliedNavigation;
  const identity=(reference,map=identities)=>reference?(map.get(reference)??reference):'';
  document.documentElement.dataset.source=applied;
  const send=(action,index,extra={})=>environment.emit({action,taskId:identity(NODES[index]?.id),reference:NODES[index]?.id??'',...extra});
  const node=target=>{
    const label=target.closest('text[data-label-for]');
    if(label)return Number(label.dataset.labelFor);
    const circle=target.closest('circle');
    return circle?Number(circle.dataset.index??-1):-1;
  };
  function decorate(circle,index){
    if(!circle)return;
    const data=NODES[index];circle.setAttribute('role','button');circle.setAttribute('tabindex','0');circle.setAttribute('aria-label',`Bubble ${data.title}`);
    circle.dataset.status=Object.keys(STATUS).indexOf(data.status)>=0?['open','planned','in_work','merged','done','waiting','dropped'][Object.keys(STATUS).indexOf(data.status)]:'';
    circle.dataset.priority=data.priority;circle.dataset.reference=data.id;circle.dataset.index=index;circle.dataset.parent=data.parent;
    circle.dataset.taskId=identity(data.id);
  }
  circles.forEach(decorate);
  for(const event of ['mouseenter','mousemove','mouseleave'])document.addEventListener(event,input=>{
    const index=node(input.target);if(index<=0)return;input.stopImmediatePropagation();
    if(event==='mouseleave')document.getElementById('detail').hidden=true;else show(index,input);
  },true);
  function applyFocus(){
    const target=identity(requested?`#${requested}`:'',pendingIdentities);
    const index=NODES.findIndex(item=>identity(item.id)===target);
    if(index>=0){hostReference=requested;document.documentElement.dataset.hostReference=hostReference;if(appliedNavigation!==navigation){appliedNavigation=navigation;open(index);}}
  }
  function attributes(element,values){for(const [name,value]of Object.entries(values))if(element.getAttribute(name)!==String(value))element.setAttribute(name,String(value));}
  async function update(url){
    const absolute=new URL(url,location.href);if(absolute.origin!==location.origin||!absolute.pathname.endsWith('/diagram'))return;
    if(absolute.href===applied){if(loading&&loading!==applied){++generation;loading='';}applyFocus();return;}
    if(absolute.href===loading)return;loading=absolute.href;const nextIdentities=new Map(pendingIdentities);
    const current=++generation;
    try{
      const response=await fetch(absolute,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('The updated task drawing could not load. Retry the drawing.');
      const html=await response.text();if(current!==generation)return;
      const parsed=new DOMParser().parseFromString(html,'text/html');const script=parsed.getElementById('task-tree-data');
      if(!script)throw new Error('The updated task drawing contains no task data. Retry the drawing.');
      const next=JSON.parse(script.textContent).NODES;const old=new Map(NODES.map((item,index)=>[identity(item.id),circles[index]]));
      const detail=document.getElementById('detail');const hovered=detail.hidden?null:identity(detail.dataset.reference);
      const rings=new Map([...svg.querySelectorAll('circle[data-ring]')].map(ring=>[identity(NODES[Number(ring.dataset.ring)]?.id),ring]));
      const ancestorsBefore=ancestors(native.focus).map(index=>identity(NODES[index].id)).reverse();
      const included=new Set(next.map(item=>identity(item.id,nextIdentities)));for(const [id,circle]of old)if(circle&&!included.has(id))circle.remove();for(const [id,ring]of rings)if(!included.has(id))ring.remove();
      NODES.splice(0,NODES.length,...next);identities=nextIdentities;native.focus=ancestorsBefore.map(id=>NODES.findIndex(item=>identity(item.id)===id)).find(index=>index>=0)??0;
      const updated=NODES.map((item,index)=>{
        if(index===0)return null;
        let circle=old.get(identity(item.id));if(!circle){circle=document.createElementNS(SVG,'circle');const following=NODES.slice(index+1).map(item=>old.get(identity(item.id))).find(circle=>circle?.isConnected);svg.insertBefore(circle,following??labelLayer);}
        const [colour,width]=stroke(item);
        attributes(circle,{cx:item.x,cy:item.y,r:item.r-width/2,fill:fill(item),'pointer-events':index===native.focus?'none':'all',stroke:item.week==='both'&&item.priority?THEME.orange:colour,'stroke-width':width});
        circle.setAttribute('aria-description',item.hover);
        decorate(circle,index);circle.style.display=inside(index,native.focus)?'':'none';
        let ring=rings.get(identity(item.id));if(item.week==='both'&&item.priority){if(!ring){ring=document.createElementNS(SVG,'circle');svg.insertBefore(ring,circle.nextSibling);}
          attributes(ring,{cx:item.x,cy:item.y,r:item.r-BORDER[item.priority]*1.5,fill:'none',stroke:colour,'stroke-width':BORDER[item.priority]});ring.style.pointerEvents='none';ring.dataset.ring=index;ring.style.display=circle.style.display;
        }else ring?.remove();
        return circle;
      });
      circles.splice(0,circles.length,...updated);labels();applied=absolute.href;document.documentElement.dataset.source=applied;applyFocus();
      if(hovered){const index=NODES.findIndex(item=>identity(item.id)===hovered);if(index>0&&inside(index,native.focus))show(index,{clientX:Number(detail.dataset.pointerX),clientY:Number(detail.dataset.pointerY)});else detail.hidden=true;}
      send('updated',native.focus);
    }catch(error){if(current===generation)send('error',native.focus,{message:error.message});}finally{if(current===generation)loading='';}
  }
  document.addEventListener('click',event=>{
    const index=node(event.target);
    if(index>0){event.stopImmediatePropagation();event.preventDefault();clearTimeout(timer);timer=setTimeout(()=>send('focus',index),250);}
    else if(event.target===svg||event.target===chart||event.target===document.querySelector('body>main')||event.target===document.body){event.stopImmediatePropagation();send('up',native.focus);}
    else if(event.target.closest('#path button'))queueMicrotask(()=>send('focus',native.focus));
  },true);
  document.addEventListener('dblclick',event=>{const index=node(event.target);if(index>0){event.stopImmediatePropagation();event.preventDefault();clearTimeout(timer);const titleOnly=[...labelLayer.querySelectorAll(`text[data-label-for="${index}"]`)].some(label=>{const matrix=label.getScreenCTM();return matrix&&label.getCharNumAtPosition(new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()))>=0;});send('edit',index,{titleOnly});}},true);
  document.addEventListener('contextmenu',event=>{const index=node(event.target);if(index>0){event.preventDefault();event.stopImmediatePropagation();send('context',index,{x:event.clientX,y:event.clientY});}},true);
  document.addEventListener('keydown',event=>{
    const index=node(event.target);
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();send('up',native.focus);}
    else if(index>0&&event.key==='Enter'){event.preventDefault();send('focus',index);}
    else if(index>0&&event.key==='F2'){event.preventDefault();send('edit',index,{titleOnly:true});}
    else if(index>0&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){event.preventDefault();const box=circles[index].getBoundingClientRect();send('context',index,{x:box.left+box.width/2,y:box.top+box.height/2});}
  },true);
  const sync=host=>{pendingIdentities=new Map((host.identities??[]).map(item=>[item.reference,item.id]));if(!identities.size){identities=new Map(pendingIdentities);circles.forEach(decorate);}requested=host.reference??'';navigation=host.navigation??0;applyFocus();if(host.url)void update(host.url);};
  observe(()=>{for(const label of labelLayer.querySelectorAll('text[data-label-for]'))label.dataset.reference=NODES[Number(label.dataset.labelFor)].id;},labelLayer,{childList:true});
  document.fonts.ready.then(()=>send('ready',native.focus));
  return {sync,dispose:()=>{clearTimeout(timer);++generation;observers.forEach(observer=>observer.disconnect());narrow.removeEventListener('change',legendLayout);}};
}
