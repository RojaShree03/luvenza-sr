import ResourcePage,{statusColumn} from "../components/ResourcePage";
import StatusBadge from "../components/StatusBadge";

export function AdminOrders(){return <ResourcePage title="Order management" endpoint="/admin/orders" description="Review orders, update progress and assign production and delivery staff." columns={[
 {key:"_id",label:"Order",render:r=>(r._id||"").slice(-8)},
 {key:"customerId",label:"Customer",render:r=>r.customerId?.name||r.customerId?.email||"—"},
 {key:"totalAmount",label:"Amount",render:r=>`₹${r.totalAmount??"—"}`},
 statusColumn,
 {key:"assignedTailor",label:"Tailor",render:r=>r.assignedTailor?.name||"Unassigned"},
 {key:"assignedDeliveryPartner",label:"Delivery partner",render:r=>r.assignedDeliveryPartner?.name||"Unassigned"}
]} actions={[
 {label:"Assign tailor",path:"/assign-tailor",fields:[{name:"tailorId",label:"Tailor User ID"}]},
 {label:"Assign delivery",path:"/assign-delivery",fields:[{name:"deliveryPartnerId",label:"Delivery partner User ID"}]},
 {label:"Cancel order",path:"/cancel",prompt:"Cancellation reason"}
]}/>;}

export function AdminCustomers(){return <ResourcePage title="Customer management" endpoint="/admin/customers" description="View customer accounts and manage account status." columns={[
 {key:"name",label:"Name"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},
 {key:"isActive",label:"Account",render:r=><StatusBadge status={r.isActive?"active":"inactive"}/>}
]} actions={[
 {label:"Activate / deactivate",path:"/status",fields:[{name:"isActive",label:"Set active? Enter true or false"}]}
]}/>;}

export function AdminTailors(){return <ResourcePage title="Tailor management" endpoint="/admin/tailors" description="Manage approved tailoring staff and availability." columns={[
 {key:"name",label:"Name"},{key:"email",label:"Email"},
 {key:"professionalDetails",label:"Specialization",render:r=>r.professionalDetails?.specialization||"—"},
 {key:"availabilityStatus",label:"Availability"},{key:"isApproved",label:"Approved",render:r=>r.isApproved?"Yes":"No"}
]} actions={[{label:"Update status",path:"/status",fields:[{name:"isActive",label:"Active? true / false"},{name:"isApproved",label:"Approved? true / false"}]}]}/>;}

export function AdminDeliveryPartners(){return <ResourcePage title="Delivery partners" endpoint="/admin/delivery-partners" description="Manage delivery accounts, approval and availability." columns={[
 {key:"name",label:"Name"},{key:"email",label:"Email"},
 {key:"deliveryDetails",label:"Vehicle",render:r=>r.deliveryDetails?.vehicleType||"—"},
 {key:"availabilityStatus",label:"Availability"},{key:"isApproved",label:"Approved",render:r=>r.isApproved?"Yes":"No"}
]} actions={[{label:"Update status",path:"/status",fields:[{name:"isActive",label:"Active? true / false"},{name:"isApproved",label:"Approved? true / false"}]}]}/>;}

export function AdminCustomizations(){return <ResourcePage title="Customization review" endpoint="/admin/customizations" description="Review customer designs before approval and tailor assignment." columns={[
 {key:"_id",label:"Request",render:r=>(r._id||"").slice(-8)},
 {key:"customizationName",label:"Design"},
 {key:"userId",label:"Customer",render:r=>r.userId?.name||"—"},
 statusColumn
]} actions={[
 {label:"Approve",path:"/status",method:"patch",fields:[{name:"status",label:"Status (customer_confirmed / approved)"},{name:"estimatedCost",label:"Estimated cost",type:"number"}]},
 {label:"Reject",path:"/status",fields:[{name:"status",label:"Status (rejected)"},{name:"reason",label:"Reason"}]}
]}/>;}

export function AdminCollections(){return <ResourcePage title="Collections" endpoint="/collections" description="Publish curated boutique collections." allowCreate createFields={[
 {name:"name",label:"Collection name"},{name:"description",label:"Description"},{name:"coverImage",label:"Cover image URL"},{name:"category",label:"Category ID"}
]} columns={[{key:"name",label:"Name"},{key:"description",label:"Description"},{key:"isActive",label:"Active",render:r=>r.isActive?"Yes":"No"}]} actions={[
 {label:"Edit",method:"put",fields:[{name:"name",label:"Collection name"},{name:"description",label:"Description"},{name:"coverImage",label:"Cover image URL"}]},
 {label:"Delete",method:"delete"}
]}/>;}

export function AdminComponents(){return <ResourcePage title="Design components" endpoint="/design-components" description="Manage fabric, color, sleeve, neckline and embellishment choices." allowCreate createFields={[
 {name:"name",label:"Component name"},{name:"type",label:"Type",options:["fabric","color","sleeve","neck","pattern","embellishment","other"]},{name:"image",label:"Image URL"},{name:"description",label:"Description"},{name:"additionalCost",label:"Additional cost",type:"number"}
]} columns={[{key:"name",label:"Name"},{key:"type",label:"Type"},{key:"additionalCost",label:"Extra cost"},{key:"isAvailable",label:"Available",render:r=>r.isAvailable?"Yes":"No"}]}/>;}

export function AdminTemplates(){return <ResourcePage title="Clothing templates" endpoint="/templates" description="Create base outfit templates customers can personalize." allowCreate createFields={[
 {name:"name",label:"Template name"},{name:"description",label:"Description"},{name:"category",label:"Category ID"},{name:"image",label:"Image URL"},{name:"basePrice",label:"Base price",type:"number"}
]} columns={[{key:"name",label:"Name"},{key:"description",label:"Description"},{key:"basePrice",label:"Base price"},{key:"isActive",label:"Active",render:r=>r.isActive?"Yes":"No"}]}/>;}
