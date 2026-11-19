/**
 * Inline new-client form for Create Application — the exact Business Profile /
 * Business Owner Detail panels from the create-client page (same fields, same
 * required rules, collapsible owners with "+ Another Owner"). Owns its own
 * react-hook-form instance; the parent validates + collects the payload through
 * the imperative `submit()` ref handle.
 */
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    DateField,
    EmailField,
    NumberField,
    PhoneField,
    SelectField,
    TextField,
} from '@/components/inputFields/InputFields'
import { useTheme } from '@/context/ThemeContext'
import type { CreateClientPayload } from '@/types/clientTypes'

type Address = {
    address1: string
    address2: string
    city: string
    state: string
    zipCode: string
}

type OwnerDetail = {
    firstName: string
    middleName: string
    lastName: string
    email: string
    mobileNumber: string
    dateOfBirth: string
    ssn: string
    ficoScore: number | string
    ownershipStartDate: string
    ownershipPercentage: number | string
    address: Address
}

type FormValues = {
    business: {
        name: string
        email: string
        number: string
        website: string
        incorporationDate: string
        incorporationState: string
        businessEntityType: string
        einNumber: string
        monthlyRevenue: number | string
        address: Address
    }
    owners: OwnerDetail[]
}

const businessEntityTypes = [
    { value: 'LLC', label: 'LLC' },
    { value: 'Corporation', label: 'Corporation' },
    { value: 'Partnership', label: 'Partnership' },
    { value: 'Sole Proprietorship', label: 'Sole Proprietorship' },
    { value: 'S-Corp', label: 'S-Corp' },
    { value: 'C-Corp', label: 'C-Corp' },
    { value: 'Non-Profit', label: 'Non-Profit' },
    { value: 'Other', label: 'Other' },
]

const emptyAddress: Address = {
    address1: '',
    address2: '',
    city: '',
    state: '',
    zipCode: '',
}

const defaultOwnerDetail: OwnerDetail = {
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    dateOfBirth: '',
    ssn: '',
    ficoScore: '',
    ownershipStartDate: '',
    ownershipPercentage: '',
    address: { ...emptyAddress },
}

const defaultFormValues: FormValues = {
    business: {
        name: '',
        email: '',
        number: '',
        website: '',
        incorporationDate: '',
        incorporationState: '',
        businessEntityType: '',
        einNumber: '',
        monthlyRevenue: '',
        address: { ...emptyAddress },
    },
    owners: [{ ...defaultOwnerDetail }],
}

const optionalEmail = yup
    .string()
    .transform((value) => (value?.trim() ? value.trim() : undefined))
    .optional()
    .email('Enter a valid email')

const ownerSchema = yup.object({
    firstName: yup.string().required('First name is required'),
    middleName: yup.string().optional(),
    lastName: yup.string().required('Last name is required'),
    email: optionalEmail,
    mobileNumber: yup.string().optional(),
    dateOfBirth: yup.string().optional(),
    ssn: yup.string().required('Social security number is required'),
    ficoScore: yup
        .number()
        .transform((value, originalValue) => (originalValue === '' || originalValue == null ? undefined : value))
        .min(300, 'Min 300')
        .max(850, 'Max 850')
        .required('FICO score is required'),
    ownershipStartDate: yup.string().optional(),
    ownershipPercentage: yup
        .number()
        .min(0, 'Min 0%')
        .max(100, 'Max 100%')
        .optional()
        .nullable()
        .transform((value, originalValue) => (originalValue === '' ? null : value)),
    address: yup.object({
        address1: yup.string().optional(),
        address2: yup.string().optional(),
        city: yup.string().optional(),
        state: yup.string().optional(),
        zipCode: yup.string().optional(),
    }),
})

const schema = yup.object({
    business: yup.object({
        name: yup.string().required('Business name is required'),
        email: optionalEmail,
        number: yup.string().optional(),
        website: yup.string().optional(),
        incorporationDate: yup.string().optional(),
        incorporationState: yup.string().optional(),
        businessEntityType: yup.string().optional(),
        einNumber: yup.string().required('EIN number is required'),
        monthlyRevenue: yup
            .number()
            .min(0, 'Must be positive')
            .optional()
            .nullable()
            .transform((value, originalValue) => (originalValue === '' ? null : value)),
        address: yup.object({
            address1: yup.string().required('Address 1 is required'),
            address2: yup.string().optional(),
            city: yup.string().required('City is required'),
            state: yup.string().optional(),
            zipCode: yup.string().required('Zip Code is required'),
        }),
    }),
    owners: yup.array().of(ownerSchema).min(1, 'At least one owner is required'),
})

export type NewClientFormHandle = {
    /** Validates the form; returns the client payload or null when invalid. */
    submit: () => Promise<CreateClientPayload | null>
}

const NewClientFormSection = forwardRef<NewClientFormHandle>(function NewClientFormSection(_props, ref) {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'
    const [expandedOwnerIndex, setExpandedOwnerIndex] = useState(0)

    const { control, trigger, getValues, watch, formState: { errors } } = useForm<FormValues>({
        resolver: yupResolver(schema) as any,
        mode: 'onChange',
        reValidateMode: 'onChange',
        shouldUnregister: false,
        defaultValues: defaultFormValues,
    })

    const { fields, append, remove } = useFieldArray({ control, name: 'owners' })
    const watchedOwners = watch('owners')

    const getOwnerLabel = (index: number) => {
        const owner = watchedOwners?.[index]
        const fullName = [owner?.firstName, owner?.middleName, owner?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim()
        return fullName || `Owner ${index + 1}`
    }

    const ownerHasErrors = (index: number) => {
        const ownerErrors = errors.owners?.[index]
        return ownerErrors != null && Object.keys(ownerErrors).length > 0
    }

    useImperativeHandle(ref, () => ({
        submit: async () => {
            const valid = await trigger()
            if (!valid) {
                const firstInvalidOwnerIndex = fields.findIndex((_, index) => ownerHasErrors(index))
                if (firstInvalidOwnerIndex >= 0) {
                    setExpandedOwnerIndex(firstInvalidOwnerIndex)
                    toast.error(`Please complete required fields for ${getOwnerLabel(firstInvalidOwnerIndex)}`)
                } else {
                    toast.error('Please complete all required client fields')
                }
                return null
            }
            const data = getValues()
            return {
                business: data.business,
                owners: data.owners,
                owner: data.owners[0],
            } as unknown as CreateClientPayload
        },
    }))

    const handleAddOwner = () => {
        const nextIndex = fields.length
        append({ ...defaultOwnerDetail })
        setExpandedOwnerIndex(nextIndex)
    }

    const handleRemoveOwner = (index: number) => {
        if (fields.length <= 1) return
        remove(index)
        setExpandedOwnerIndex((current) => {
            if (current === index) return Math.max(0, index - 1)
            if (current > index) return current - 1
            return current
        })
    }

    const labelClassName = isDark ? 'text-white' : 'text-[#374151]'

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border pb-5 ${isDark ? 'bg-card border-[#243a58]' : 'border-[#FDFDFD]'
                }`}>
                <CardContent className="space-y-3 p-0">
                    <h2 className={`text-base font-[600] font-roboto px-6 py-3 ${isDark ? 'text-white bg-[#1a2c47]' : 'text-[#374151] bg-[#F9FAFD]'
                        }`}>Business Profile</h2>
                    <div className="px-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextField control={control} name="business.name" label="Business Name" placeholder="Enter business name" labelClassName={labelClassName} required />
                        <EmailField control={control} name="business.email" label="Email" placeholder="Enter email address" labelClassName={labelClassName} />
                        <PhoneField control={control} name="business.number" label="Phone Number" placeholder="(XXX) XXX-XXXX" labelClassName={labelClassName} />
                        <TextField control={control} name="business.website" label="Website" placeholder="https://example.com" labelClassName={labelClassName} />
                        <DateField control={control} name="business.incorporationDate" label="Incorporation Date" labelClassName={labelClassName} />
                        <TextField control={control} name="business.incorporationState" label="Incorporation State" placeholder="e.g., FL, NY" labelClassName={labelClassName} />
                        <SelectField
                            control={control}
                            name="business.businessEntityType"
                            label="Type of Business Entity"
                            options={businessEntityTypes}
                            placeholder="Select entity type"
                            labelClassName={labelClassName}
                        />
                        <TextField control={control} name="business.einNumber" label="EIN Number" placeholder="XX-XXXXXXX" labelClassName={labelClassName} required />
                        <NumberField
                            control={control}
                            name="business.monthlyRevenue"
                            label="Monthly Revenue"
                            min={0}
                            prefix="$"
                            placeholder="0.00"
                            labelClassName={labelClassName}
                        />
                        <TextField control={control} name="business.address.address1" label="Address 1" placeholder="Enter street address" labelClassName={labelClassName} required />
                        <TextField control={control} name="business.address.address2" label="Address 2" placeholder="Enter apartment, suite, etc. (optional)" labelClassName={labelClassName} />
                        <TextField control={control} name="business.address.city" label="City" placeholder="Enter city" labelClassName={labelClassName} required />
                        <TextField control={control} name="business.address.state" label="State" placeholder="e.g., FL" labelClassName={labelClassName} />
                        <TextField control={control} name="business.address.zipCode" label="Zip Code" required placeholder="XXXXX" labelClassName={labelClassName} />
                    </div>
                </CardContent>
            </Card>

            <Card className={`rounded-sm box-border shadow-[0px_4px_20px_0px_#00000005] p-0 border pb-5 ${isDark ? 'bg-card border-[#243a58]' : 'border-[#FDFDFD]'
                }`}>
                <CardContent className="space-y-3 p-0">
                    <div className={`flex items-center justify-between px-6 py-3 ${isDark ? 'text-white bg-[#1a2c47]' : 'text-[#374151] bg-[#F9FAFD]'
                        }`}>
                        <h2 className="text-base font-[600] font-roboto">Business Owner Detail</h2>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleAddOwner}
                            className="h-8 px-2 gap-1 text-[var(--brand)] hover:text-[var(--brand)]/90 hover:bg-transparent cursor-pointer"
                        >
                            <Plus className="size-4" />
                            Another Owner
                        </Button>
                    </div>

                    <div className="px-6 space-y-3">
                        {fields.map((field, index) => {
                            const isExpanded = expandedOwnerIndex === index
                            const hasErrors = ownerHasErrors(index)
                            return (
                                <div
                                    key={field.id}
                                    className={`rounded-md border overflow-hidden ${isDark ? 'border-[#243a58]' : hasErrors ? 'border-red-300' : 'border-[#E5E7EB]'
                                        }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setExpandedOwnerIndex(isExpanded ? -1 : index)}
                                        className={`w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer ${isDark ? 'bg-[#1E1F23] hover:bg-[#25262B]' : 'bg-[#F9FAFD] hover:bg-[#F3F4F6]'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-medium ${labelClassName}`}>
                                                {getOwnerLabel(index)}
                                            </span>
                                            {hasErrors && (
                                                <span className="text-xs text-red-500 font-normal">Incomplete</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {fields.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        handleRemoveOwner(index)
                                                    }}
                                                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-transparent cursor-pointer"
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            )}
                                            {isExpanded ? (
                                                <ChevronUp className={`size-4 ${labelClassName}`} />
                                            ) : (
                                                <ChevronDown className={`size-4 ${labelClassName}`} />
                                            )}
                                        </div>
                                    </button>

                                    <div className={isExpanded ? 'px-4 pb-4 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4' : 'hidden'}>
                                        <TextField control={control} name={`owners.${index}.firstName`} label="First Name" placeholder="Enter first name" labelClassName={labelClassName} required />
                                        <TextField control={control} name={`owners.${index}.middleName`} label="Middle Name" placeholder="Enter middle name" labelClassName={labelClassName} />
                                        <TextField control={control} name={`owners.${index}.lastName`} label="Last Name" placeholder="Enter last name" labelClassName={labelClassName} required />
                                        <EmailField control={control} name={`owners.${index}.email`} label="Email" placeholder="Enter email address" labelClassName={labelClassName} />
                                        <PhoneField control={control} name={`owners.${index}.mobileNumber`} label="Mobile Number" placeholder="(XXX) XXX-XXXX" labelClassName={labelClassName} />
                                        <DateField control={control} name={`owners.${index}.dateOfBirth`} label="Date of Birth" labelClassName={labelClassName} />
                                        <TextField control={control} name={`owners.${index}.ssn`} label="Social Security Number (SSN)" placeholder="XXX-XX-XXXX" labelClassName={labelClassName} required />
                                        <NumberField
                                            control={control}
                                            name={`owners.${index}.ficoScore`}
                                            label="FICO Score"
                                            min={300}
                                            max={850}
                                            placeholder="300-850"
                                            labelClassName={labelClassName}
                                            required
                                        />
                                        <DateField control={control} name={`owners.${index}.ownershipStartDate`} label="Ownership Start Date" labelClassName={labelClassName} />
                                        <NumberField
                                            control={control}
                                            name={`owners.${index}.ownershipPercentage`}
                                            label="Ownership Percentage"
                                            min={0}
                                            max={100}
                                            suffix="%"
                                            placeholder="0-100"
                                            labelClassName={labelClassName}
                                        />
                                        <TextField control={control} name={`owners.${index}.address.address1`} label="Address 1" placeholder="Enter street address" labelClassName={labelClassName} />
                                        <TextField control={control} name={`owners.${index}.address.address2`} label="Address 2" placeholder="Enter apartment, suite, etc. (optional)" labelClassName={labelClassName} />
                                        <TextField control={control} name={`owners.${index}.address.city`} label="City" placeholder="Enter city" labelClassName={labelClassName} />
                                        <TextField control={control} name={`owners.${index}.address.state`} label="State" placeholder="e.g., FL" labelClassName={labelClassName} />
                                        <TextField control={control} name={`owners.${index}.address.zipCode`} label="Zip Code" placeholder="XXXXX" labelClassName={labelClassName} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
})

export default NewClientFormSection
