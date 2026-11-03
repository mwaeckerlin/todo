import { useId } from 'react';

export function DateInput({value,onChange,menu=false}:{value:string|null;onChange:(value:string|null)=>void;menu?:boolean}){
  const id=useId();
  return <div className="date-field">
    <label data-field="Due date" htmlFor={id}>Due date</label>
    <button type="button" role={menu?'menuitem':undefined} aria-label="Clear due date" disabled={!value} onClick={()=>onChange(null)}>{menu?'Clear due date':'Clear'}</button>
    <input id={id} type="date" value={value??''} onChange={event=>onChange(event.target.value||null)}/>
  </div>;
}
