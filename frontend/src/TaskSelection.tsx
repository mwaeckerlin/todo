import { useState } from 'react'
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Field, Label } from '@headlessui/react'
import { Check, ChevronDown, X } from 'lucide-react'

export function TaskSelection({label,value,options,disabled,onChange}:{label:string;value:string[];options:{id:string;title:string}[];disabled:boolean;onChange:(value:string[])=>void}) {
  const [query,setQuery]=useState('')
  const choices=options.filter(option=>option.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <Field className="task-selection" disabled={disabled}>
    <Label data-field={label}>{label}</Label>
    <Combobox multiple value={value} onChange={onChange} onClose={()=>setQuery('')}>
      <div className="selection-control">
        <ul className="selection-values" aria-label={`Selected ${label.toLocaleLowerCase()}`}>
          {value.map(id=><li key={id}><span>{options.find(option=>option.id===id)?.title??id}</span><button type="button" aria-label={`Remove ${options.find(option=>option.id===id)?.title??id}`} disabled={disabled} onClick={()=>onChange(value.filter(current=>current!==id))}><X aria-hidden="true"/></button></li>)}
        </ul>
        <div className="selection-search"><ComboboxInput aria-label={label} placeholder={`Search ${label.toLocaleLowerCase()}…`} onChange={event=>setQuery(event.target.value)} /><ComboboxButton aria-label={`Show ${label.toLocaleLowerCase()}`}><ChevronDown aria-hidden="true"/></ComboboxButton></div>
        <ComboboxOptions anchor="bottom start" className="selection-options" modal={false}>
          {choices.map(option=><ComboboxOption key={option.id} value={option.id}><Check aria-hidden="true"/><span>{option.title}</span></ComboboxOption>)}
          {!choices.length&&<p>No matching entries</p>}
        </ComboboxOptions>
      </div>
    </Combobox>
  </Field>
}
